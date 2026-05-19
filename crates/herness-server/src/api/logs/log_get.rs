use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::{Extension, Json};
use serde_json::json;
use sqlx::Row;

use super::super::middleware::Claims;
use super::super::router::AppState;

pub async fn get_log_entry(
    State(state): State<AppState>,
    Extension(claims): Extension<Claims>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    let row = match sqlx::query(
        "SELECT id, chain_id, status, input_json, output_json, error, started_at, completed_at, duration_ms, user_id, created_at FROM rule_execution_logs WHERE id = ? AND user_id = ?",
    )
    .bind(&id)
    .bind(&claims.sub)
    .fetch_optional(&state.pool)
    .await
    {
        Ok(Some(r)) => r,
        Ok(None) => return (StatusCode::NOT_FOUND, Json(json!({"error": "Log not found"}))),
        Err(_) => return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"error": "Database error"}))),
    };

    // Fetch node-level executions for this run
    let node_rows = match sqlx::query(
        "SELECT id, node_id, node_type, input_json, output_json, error, started_at, completed_at, duration_ms FROM rule_node_executions WHERE execution_id = ?",
    )
    .bind(&id)
    .fetch_all(&state.pool)
    .await
    {
        Ok(r) => r,
        Err(_) => vec![],
    };

    let nodes: Vec<serde_json::Value> = node_rows
        .iter()
        .map(|row| {
            json!({
                "id": row.get::<String, _>(0),
                "node_id": row.get::<String, _>(1),
                "node_type": row.get::<String, _>(2),
                "input_json": row.get::<Option<String>, _>(3),
                "output_json": row.get::<Option<String>, _>(4),
                "error": row.get::<Option<String>, _>(5),
                "started_at": row.get::<String, _>(6),
                "completed_at": row.get::<String, _>(7),
                "duration_ms": row.get::<Option<i64>, _>(8),
            })
        })
        .collect();

    (
        StatusCode::OK,
        Json(json!({
            "id": row.get::<String, _>(0),
            "chain_id": row.get::<String, _>(1),
            "status": row.get::<String, _>(2),
            "input_json": row.get::<String, _>(3),
            "output_json": row.get::<String, _>(4),
            "error": row.get::<Option<String>, _>(5),
            "started_at": row.get::<String, _>(6),
            "completed_at": row.get::<String, _>(7),
            "duration_ms": row.get::<Option<i64>, _>(8),
            "user_id": row.get::<String, _>(9),
            "created_at": row.get::<String, _>(10),
            "node_executions": nodes,
        })),
    )
}
