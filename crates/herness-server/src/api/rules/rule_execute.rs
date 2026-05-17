use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::{Extension, Json};
use serde::Deserialize;
use serde_json::Value;
use sqlx::Row;

use herness_common::db::pool::DbPool;
use herness_common::utils::id::generate_id;
use herness_rule::dsl::parser;

use super::super::middleware::Claims;
use super::super::router::AppState;

#[derive(Debug, Deserialize)]
pub struct ExecuteRuleRequest {
    pub input: Value,
}

pub async fn execute_rule(
    State(state): State<AppState>,
    State(pool): State<DbPool>,
    Extension(claims): Extension<Claims>,
    Path(id): Path<String>,
    Json(req): Json<ExecuteRuleRequest>,
) -> Result<impl IntoResponse, StatusCode> {
    let row = sqlx::query(
        "SELECT dsl_json FROM rule_chains WHERE id = ? AND user_id = ?",
    )
    .bind(&id)
    .bind(&claims.sub)
    .fetch_optional(&pool)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
    .ok_or(StatusCode::NOT_FOUND)?;

    let dsl_str: String = row.get(0);

    let chain = parser::parse(&dsl_str).map_err(|e| {
        tracing::warn!("DSL parse error for execution: {}", e);
        StatusCode::BAD_REQUEST
    })?;

    let chain_id = chain.chain_id.clone();
    state.rule_engine.cache_chain(chain);

    let started_at = chrono::Utc::now();
    match state.rule_engine.execute(&chain_id, req.input.clone()).await {
        Ok(output) => {
            let completed_at = chrono::Utc::now();
            let duration_ms = (completed_at - started_at).num_milliseconds();

            let exec_id = generate_id();
            let input_json = serde_json::to_string(&req.input).unwrap_or_default();
            let output_json = serde_json::to_string(&output).unwrap_or_default();

            let _ = sqlx::query(
                "INSERT INTO rule_execution_logs (id, chain_id, status, input_json, output_json, started_at, completed_at, duration_ms, user_id) VALUES (?, ?, 'completed', ?, ?, ?, ?, ?, ?)",
            )
            .bind(&exec_id)
            .bind(&id)
            .bind(&input_json)
            .bind(&output_json)
            .bind(&started_at.to_rfc3339())
            .bind(&completed_at.to_rfc3339())
            .bind(duration_ms)
            .bind(&claims.sub)
            .execute(&pool)
            .await;

            Ok(Json(serde_json::json!({
                "status": "completed",
                "output": output,
                "execution_id": exec_id,
                "duration_ms": duration_ms
            })))
        }
        Err(e) => {
            let completed_at = chrono::Utc::now();
            let duration_ms = (completed_at - started_at).num_milliseconds();

            let exec_id = generate_id();
            let input_json = serde_json::to_string(&req.input).unwrap_or_default();
            let error_msg = e.to_string();

            let _ = sqlx::query(
                "INSERT INTO rule_execution_logs (id, chain_id, status, input_json, error, started_at, completed_at, duration_ms, user_id) VALUES (?, ?, 'failed', ?, ?, ?, ?, ?, ?)",
            )
            .bind(&exec_id)
            .bind(&id)
            .bind(&input_json)
            .bind(&error_msg)
            .bind(&started_at.to_rfc3339())
            .bind(&completed_at.to_rfc3339())
            .bind(duration_ms)
            .bind(&claims.sub)
            .execute(&pool)
            .await;

            Ok(Json(serde_json::json!({
                "status": "failed",
                "error": error_msg,
                "execution_id": exec_id,
                "duration_ms": duration_ms
            })))
        }
    }
}
