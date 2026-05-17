use herness_common::db::pool::init_db;
use herness_rule::engine::RuleEngine;
use herness_rule::interceptor::builtins::auth::AuthInterceptor;
use herness_rule::interceptor::builtins::logging::LoggingInterceptor;
use herness_rule::interceptor::builtins::metrics::MetricsInterceptor;
use herness_rule::interceptor::builtins::validation::ValidationInterceptor;
use herness_rule::interceptor::InterceptorRegistry;
use herness_rule::node::builtins::assign::AssignNode;
use herness_rule::node::builtins::condition::ConditionNode;
use herness_rule::node::builtins::delay::DelayNode;
use herness_rule::node::builtins::end::EndNode;
use herness_rule::node::builtins::fork::ForkNode;
use herness_rule::node::builtins::join::JoinNode;
use herness_rule::node::builtins::log_node::LogNode;
use herness_rule::node::builtins::loop_node::LoopNode;
use herness_rule::node::builtins::notification::NotificationNode;
use herness_rule::node::builtins::rest_client::RestClientNode;
use herness_rule::node::builtins::script::ScriptNode;
use herness_rule::node::builtins::start::StartNode;
use herness_rule::node::builtins::subchain::SubchainNode;
use herness_rule::node::builtins::transform::TransformNode;
use herness_rule::node::registry::NodeRegistry;
use herness_server::api::router::{create_router, AppState};
use herness_server::config::ServerConfig;
use std::sync::Arc;
use tokio::net::TcpListener;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    dotenvy::dotenv().ok();
    tracing_subscriber::fmt::init();

    let config = ServerConfig::from_env();

    let pool = init_db(&config.database_url).await?;
    tracing::info!("Database initialized");

    // Build node registry
    let (node_registry, fork_node, subchain_node, loop_node) = build_node_registry();
    let node_registry = Arc::new(node_registry);
    let interceptor_registry = Arc::new(build_interceptor_registry());

    // Build rule engine
    let rule_engine = Arc::new(RuleEngine::new(
        node_registry.clone(),
        interceptor_registry,
    ));

    // Wire engine/registry into nodes that need it
    fork_node.set_node_registry(node_registry).await;
    subchain_node.set_engine(rule_engine.clone()).await;
    loop_node.set_engine(rule_engine.clone()).await;

    let state = AppState {
        pool,
        rule_engine,
    };

    let app = create_router(state);

    let listener = TcpListener::bind(config.addr()).await?;
    tracing::info!("Server listening on {}", config.addr());

    axum::serve(listener, app).await?;

    Ok(())
}

fn build_node_registry() -> (
    NodeRegistry,
    Arc<ForkNode>,
    Arc<SubchainNode>,
    Arc<LoopNode>,
) {
    let mut registry = NodeRegistry::new();

    // Nodes that don't need engine reference
    registry.register(Arc::new(StartNode));
    registry.register(Arc::new(EndNode));
    registry.register(Arc::new(ConditionNode));
    registry.register(Arc::new(TransformNode));
    registry.register(Arc::new(DelayNode));
    registry.register(Arc::new(AssignNode));
    registry.register(Arc::new(LogNode));
    registry.register(Arc::new(RestClientNode));
    registry.register(Arc::new(ScriptNode));
    registry.register(Arc::new(NotificationNode));
    registry.register(Arc::new(JoinNode));

    // Nodes that need engine/registry reference — keep Arcs to wire up later
    let fork_node = Arc::new(ForkNode::new());
    let subchain_node = Arc::new(SubchainNode::new());
    let loop_node = Arc::new(LoopNode::new());

    registry.register(fork_node.clone());
    registry.register(subchain_node.clone());
    registry.register(loop_node.clone());

    (registry, fork_node, subchain_node, loop_node)
}

fn build_interceptor_registry() -> InterceptorRegistry {
    let mut registry = InterceptorRegistry::new();
    registry.register(Arc::new(LoggingInterceptor));
    registry.register(Arc::new(MetricsInterceptor::new()));
    registry.register(Arc::new(AuthInterceptor));
    registry.register(Arc::new(ValidationInterceptor));
    registry
}
