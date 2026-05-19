use herness_common::db::pool::init_db;
use herness_rule::engine::{EngineConfig, RuleEngine};
use herness_rule::interceptor::builtins::auth::AuthInterceptor;
use herness_rule::interceptor::builtins::logging::LoggingInterceptor;
use herness_rule::interceptor::builtins::metrics::MetricsInterceptor;
use herness_rule::interceptor::builtins::validation::ValidationInterceptor;
use herness_rule::interceptor::InterceptorRegistry;
use herness_rule::node::builtins::assign::AssignNode;
use herness_rule::node::builtins::break_loop::BreakLoopNode;
use herness_rule::node::builtins::condition::ConditionNode;
use herness_rule::node::builtins::delay::DelayNode;
use herness_rule::node::builtins::end::EndNode;
use herness_rule::node::builtins::fork::ForkNode;
use herness_rule::node::builtins::join::JoinNode;
use herness_rule::node::builtins::llm::LlmNode;
use herness_rule::node::builtins::log_node::LogNode;
use herness_rule::node::builtins::loop_node::LoopNode;
use herness_rule::node::builtins::notification::NotificationNode;
use herness_rule::node::builtins::rest_client::RestClientNode;
use herness_rule::node::builtins::script::ScriptNode;
use herness_rule::node::builtins::start::StartNode;
use herness_rule::node::builtins::subchain::SubchainNode;
use herness_rule::node::builtins::switch::SwitchNode;
use herness_rule::node::builtins::transform::TransformNode;
use herness_rule::node::builtins::try_catch::TryCatchNode;
use herness_rule::node::registry::NodeRegistry;
use herness_server::api::router::{create_router, AppState};
use herness_server::config::ServerConfig;
use std::sync::Arc;
use tokio::net::TcpListener;
use tokio::signal;

async fn shutdown_signal() {
    let ctrl_c = async {
        signal::ctrl_c()
            .await
            .expect("failed to install Ctrl+C handler");
    };

    #[cfg(unix)]
    let terminate = async {
        signal::unix::signal(signal::unix::SignalKind::terminate())
            .expect("failed to install signal handler")
            .recv()
            .await;
    };

    #[cfg(not(unix))]
    let terminate = std::future::pending::<()>();

    tokio::select! {
        _ = ctrl_c => tracing::info!("Received Ctrl+C, shutting down gracefully..."),
        _ = terminate => tracing::info!("Received SIGTERM, shutting down gracefully..."),
    }
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    dotenvy::dotenv().ok();

    // Configure structured JSON logging for production, plain text for dev
    let rust_log = std::env::var("RUST_LOG").unwrap_or_else(|_| "info".to_string());
    if std::env::var("LOG_FORMAT").map(|v| v == "json").unwrap_or(false) {
        tracing_subscriber::fmt()
            .json()
            .with_env_filter(rust_log)
            .init();
    } else {
        tracing_subscriber::fmt()
            .with_env_filter(rust_log)
            .init();
    }

    let config = ServerConfig::from_env();

    let pool = init_db(&config.database_url).await?;
    tracing::info!("Database initialized");

    // Build node registry
    let (node_registry, fork_node, subchain_node, loop_node, switch_node, try_catch_node) =
        build_node_registry();
    let node_registry = Arc::new(node_registry);

    // Build metrics interceptor separately so we can share it with AppState
    let metrics_interceptor = Arc::new(MetricsInterceptor::new());
    let interceptor_registry = Arc::new(build_interceptor_registry(metrics_interceptor.clone()));

    // Build rule engine with config
    let engine_config = EngineConfig {
        max_steps: config.engine_max_steps,
        execution_timeout_secs: config.engine_timeout_secs,
    };
    let rule_engine = Arc::new(RuleEngine::new(
        node_registry.clone(),
        interceptor_registry,
        engine_config,
    ));

    // Wire engine into nodes that need it
    fork_node.set_engine(rule_engine.clone()).await;
    subchain_node.set_engine(rule_engine.clone()).await;
    loop_node.set_engine(rule_engine.clone()).await;
    switch_node.set_engine(rule_engine.clone()).await;
    try_catch_node.set_engine(rule_engine.clone()).await;

    // Preload enabled chains into engine cache
    match preload_enabled_chains(&pool, &rule_engine).await {
        Ok(count) => tracing::info!("Preloaded {} enabled rule chains", count),
        Err(e) => tracing::warn!("Failed to preload chains: {}", e),
    }

    let state = AppState {
        pool,
        rule_engine,
        metrics_interceptor,
    };

    let app = create_router(state);

    let listener = TcpListener::bind(config.addr()).await?;
    tracing::info!("Server listening on {}", config.addr());

    axum::serve(listener, app)
        .with_graceful_shutdown(shutdown_signal())
        .await?;

    tracing::info!("Server shutdown complete");
    Ok(())
}

fn build_node_registry() -> (
    NodeRegistry,
    Arc<ForkNode>,
    Arc<SubchainNode>,
    Arc<LoopNode>,
    Arc<SwitchNode>,
    Arc<TryCatchNode>,
) {
    let mut registry = NodeRegistry::new();

    // Nodes that don't need engine reference
    registry.register(Arc::new(StartNode));
    registry.register(Arc::new(EndNode));
    let condition_node = Arc::new(ConditionNode);
    registry.register(condition_node.clone());
    registry.register_with_type("if", condition_node);
    registry.register(Arc::new(TransformNode));
    registry.register(Arc::new(DelayNode));
    registry.register(Arc::new(AssignNode));
    registry.register(Arc::new(LogNode));
    registry.register(Arc::new(RestClientNode));
    registry.register(Arc::new(ScriptNode));
    registry.register(Arc::new(NotificationNode));
    registry.register(Arc::new(JoinNode));
    registry.register(Arc::new(BreakLoopNode));
    registry.register(Arc::new(LlmNode));

    // Nodes that need engine/registry reference — keep Arcs to wire up later
    let fork_node = Arc::new(ForkNode::new());
    let subchain_node = Arc::new(SubchainNode::new());
    let loop_node = Arc::new(LoopNode::new());
    let switch_node = Arc::new(SwitchNode::new());
    let try_catch_node = Arc::new(TryCatchNode::new());

    registry.register(fork_node.clone());
    registry.register(subchain_node.clone());
    registry.register(loop_node.clone());
    registry.register(switch_node.clone());
    registry.register(try_catch_node.clone());

    (
        registry,
        fork_node,
        subchain_node,
        loop_node,
        switch_node,
        try_catch_node,
    )
}

fn build_interceptor_registry(metrics: Arc<MetricsInterceptor>) -> InterceptorRegistry {
    let mut registry = InterceptorRegistry::new();
    registry.register(Arc::new(LoggingInterceptor));
    registry.register(metrics);
    registry.register(Arc::new(AuthInterceptor));
    registry.register(Arc::new(ValidationInterceptor));
    registry
}

async fn preload_enabled_chains(
    pool: &herness_common::db::pool::DbPool,
    engine: &herness_rule::engine::RuleEngine,
) -> anyhow::Result<usize> {
    use sqlx::Row;
    let rows = sqlx::query(
        "SELECT id, dsl_json FROM rule_chains WHERE status = 'enabled'",
    )
    .fetch_all(pool)
    .await?;

    let chains: Vec<(String, String)> = rows
        .iter()
        .map(|row| (row.get(0), row.get(1)))
        .collect();

    Ok(engine.preload_chains_from(chains))
}
