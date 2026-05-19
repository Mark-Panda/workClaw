use axum::extract::{FromRef, State};
use axum::middleware as axum_mw;
use axum::response::IntoResponse;
use axum::routing::{delete, get, post, put};
use axum::Router;
use herness_common::db::pool::DbPool;
use herness_rule::engine::RuleEngine;
use herness_rule::interceptor::builtins::metrics::MetricsInterceptor;
use std::sync::Arc;
use tower_http::cors::{AllowOrigin, CorsLayer};

use super::agents::*;
use super::auth::*;
use super::chat::*;
use super::kanban::boards::*;
use super::kanban::columns::*;
use super::kanban::tasks::*;
use super::logs::*;
use super::mcp_servers::*;
use super::middleware::auth_middleware;
use super::models::*;
use super::rules::*;
use super::skills::*;

#[derive(Clone)]
pub struct AppState {
    pub pool: DbPool,
    pub rule_engine: Arc<RuleEngine>,
    pub metrics_interceptor: Arc<MetricsInterceptor>,
}

impl FromRef<AppState> for DbPool {
    fn from_ref(state: &AppState) -> Self {
        state.pool.clone()
    }
}

pub fn create_router(state: AppState) -> Router {
    // CORS layer
    let cors = CorsLayer::new()
        .allow_origin(AllowOrigin::any())
        .allow_methods(tower_http::cors::Any)
        .allow_headers(tower_http::cors::Any);

    // Health check
    let health = Router::new().route("/health", get(health_check));

    // Auth routes (no middleware)
    let auth = Router::new()
        .route("/register", post(register::register))
        .route("/login", post(login::login));

    // Protected API routes
    let api = Router::new()
        .route("/agents", get(agent_list::list_agents).post(agent_create::create_agent))
        .route(
            "/agents/{id}",
            get(agent_get::get_agent)
                .put(agent_update::update_agent)
                .delete(agent_delete::delete_agent),
        )
        .route("/agents/{id}/start", post(agent_start::start_agent))
        .route("/agents/{id}/stop", post(agent_stop::stop_agent))
        .route("/skills", get(list_skills).post(upload_skill))
        .route("/skills/{name}", delete(delete_skill))
        .route("/skills/{name}/content", get(get_skill_content))
        .route(
            "/mcp-servers",
            get(list_mcp_servers).post(create_mcp_server),
        )
        .route(
            "/mcp-servers/{id}",
            get(get_mcp_server)
                .put(update_mcp_server)
                .delete(delete_mcp_server),
        )
        .route("/rules", get(rule_list::list_rules).post(rule_create::create_rule))
        .route(
            "/rules/{id}",
            get(rule_get::get_rule)
                .put(rule_update::update_rule)
                .delete(rule_delete::delete_rule),
        )
        .route("/rules/{id}/execute", post(rule_execute::execute_rule))
        .route("/rules/{id}/toggle", post(rule_toggle::toggle_rule))
        .route("/rules/validate", post(rule_validate::validate_rule))
        .route("/rules/{id}/export", get(rule_export::export_rule))
        .route("/rules/import", post(rule_import::import_rule))
        .route("/rules/metrics", get(rule_metrics::get_metrics))
        .route("/chat/send", post(chat_send::send_message))
        .route("/chat/conversations", get(chat_history::list_conversations))
        .route(
            "/chat/conversations/{id}",
            get(chat_history::get_conversation).delete(chat_history::delete_conversation),
        )
        .route("/kanban/boards", get(board_list::list_boards).post(board_create::create_board))
        .route(
            "/kanban/boards/{id}",
            get(board_get::get_board)
                .put(board_update::update_board)
                .delete(board_delete::delete_board),
        )
        .route("/kanban/boards/{id}/columns", post(column_create::create_column))
        .route(
            "/kanban/columns/{id}",
            put(column_update::update_column).delete(column_delete::delete_column),
        )
        .route("/kanban/columns/{id}/tasks", get(task_list::list_tasks).post(task_create::create_task))
        .route(
            "/kanban/tasks/{id}",
            get(task_get::get_task)
                .put(task_update::update_task)
                .delete(task_delete::delete_task),
        )
        .route("/kanban/tasks/{id}/move", axum::routing::patch(task_move::move_task))
        .route("/logs", get(log_list::list_logs))
        .route("/logs/{id}", get(log_get::get_log_entry))
        .route("/logs/stream", get(log_stream::stream_logs))
        .route("/logs/export", get(log_export::export_logs))
        .route("/models/providers", get(provider_list::list_providers).post(provider_create::create_provider))
        .route(
            "/models/providers/{id}",
            get(provider_get::get_provider)
                .put(provider_update::update_provider)
                .delete(provider_delete::delete_provider),
        )
        .route("/models/providers/{id}/models", post(model_create::add_model))
        .route(
            "/models/models/{id}",
            put(model_update::update_model).delete(model_delete::delete_model),
        )
        .layer(axum_mw::from_fn(auth_middleware));

    // WebSocket route (not under /api)
    let ws_router = Router::new()
        .route("/ws/chat", get(crate::ws::handler::chat_ws_handler));

    Router::new()
        .merge(ws_router)
        .nest("/api", Router::new().merge(health).merge(auth).merge(api))
        .layer(cors)
        .with_state(state)
}

async fn health_check(State(state): State<AppState>) -> impl IntoResponse {
    let db_ok = sqlx::query_scalar::<_, i32>("SELECT 1")
        .fetch_one(&state.pool)
        .await
        .is_ok();

    axum::Json(serde_json::json!({
        "status": if db_ok { "healthy" } else { "degraded" },
        "cached_chains": state.rule_engine.cached_chain_count(),
        "database": if db_ok { "ok" } else { "error" },
    }))
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::body::Body;
    use axum::http::{Request, StatusCode};
    use herness_common::db::pool::init_db;
    use herness_rule::engine::EngineConfig;
    use herness_rule::interceptor::InterceptorRegistry;
    use herness_rule::node::registry::NodeRegistry;
    use tower::ServiceExt;

    async fn test_state() -> AppState {
        let pool = init_db("sqlite::memory:")
            .await
            .expect("Failed to create test database");

        let node_registry = Arc::new(NodeRegistry::new());
        let interceptor_registry = Arc::new(InterceptorRegistry::new());
        let metrics_interceptor = Arc::new(MetricsInterceptor::new());

        let rule_engine = Arc::new(RuleEngine::new(node_registry, interceptor_registry, EngineConfig::default()));

        AppState { pool, rule_engine, metrics_interceptor }
    }

    #[tokio::test]
    async fn test_health_check() {
        let state = test_state().await;
        let app = create_router(state);

        let response = app
            .oneshot(
                Request::builder()
                    .uri("/api/health")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::OK);
    }
}
