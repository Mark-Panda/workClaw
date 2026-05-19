use axum::extract::State;
use axum::response::IntoResponse;
use axum::Json;

use super::super::router::AppState;

pub async fn get_metrics(
    State(state): State<AppState>,
) -> impl IntoResponse {
    Json(serde_json::json!({
        "cached_chains": state.rule_engine.cached_chain_count(),
        "node_executions": state.metrics_interceptor.node_executions(),
        "node_errors": state.metrics_interceptor.node_errors(),
    }))
}
