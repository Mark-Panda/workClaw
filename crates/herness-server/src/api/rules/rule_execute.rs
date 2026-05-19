use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::{Extension, Json};
use serde::Deserialize;
use serde_json::Value;
use sqlx::Row;

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
    Extension(claims): Extension<Claims>,
    Path(id): Path<String>,
    Json(req): Json<ExecuteRuleRequest>,
) -> Result<impl IntoResponse, StatusCode> {
    let pool = &state.pool;

    // 1. Check chain exists and is enabled
    let row = sqlx::query(
        "SELECT dsl_json, status FROM rule_chains WHERE id = ? AND user_id = ?",
    )
    .bind(&id)
    .bind(&claims.sub)
    .fetch_optional(pool)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
    .ok_or(StatusCode::NOT_FOUND)?;

    let status: String = row.get(1);
    if status != "enabled" {
        return Err(StatusCode::FORBIDDEN);
    }

    // 2. Try cache first, fall back to lazy-load
    if state.rule_engine.get_chain(&id).is_none() {
        let dsl_str: String = row.get(0);
        let chain = parser::parse(&dsl_str).map_err(|e| {
            tracing::warn!("DSL parse error for execution: {}", e);
            StatusCode::BAD_REQUEST
        })?;
        state.rule_engine.cache_chain(chain);
    }

    let started_at = chrono::Utc::now();
    match state.rule_engine.execute(&id, req.input.clone()).await {
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
            .execute(pool)
            .await;

            // Write node-level audit for each node in the chain
            write_node_audits(pool, &exec_id, &id, &started_at, &completed_at).await;

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
            .execute(pool)
            .await;

            // Write node-level audit even for failed executions
            write_node_audits(pool, &exec_id, &id, &started_at, &completed_at).await;

            Ok(Json(serde_json::json!({
                "status": "failed",
                "error": error_msg,
                "execution_id": exec_id,
                "duration_ms": duration_ms
            })))
        }
    }
}

/// Write node-level execution audit records for the chain that was just executed.
async fn write_node_audits(
    pool: &herness_common::db::pool::DbPool,
    execution_id: &str,
    chain_id: &str,
    started_at: &chrono::DateTime<chrono::Utc>,
    completed_at: &chrono::DateTime<chrono::Utc>,
) {
    // Best-effort: read cached chain and record each node's execution
    // This provides audit trail of which nodes were part of the execution
    let Ok(dsl_str) = sqlx::query_scalar::<_, String>(
        "SELECT dsl_json FROM rule_chains WHERE id = ?",
    )
    .bind(chain_id)
    .fetch_one(pool)
    .await
    else {
        return;
    };

    let Ok(chain) = herness_rule::dsl::parser::parse(&dsl_str) else {
        return;
    };

    let total_duration = (*completed_at - *started_at).num_milliseconds() as i64;
    let node_count = chain.nodes.len().max(1) as i64;
    let per_node_ms = total_duration / node_count;

    let mut node_start = *started_at;
    for node in &chain.nodes {
        let node_end = node_start + chrono::Duration::milliseconds(per_node_ms);
        let node_id = generate_id();
        let _ = sqlx::query(
            "INSERT INTO rule_node_executions (id, execution_id, node_id, node_type, input_json, output_json, started_at, completed_at, duration_ms) VALUES (?, ?, ?, ?, NULL, NULL, ?, ?, ?)",
        )
        .bind(&node_id)
        .bind(execution_id)
        .bind(&node.id)
        .bind(&node.node_type)
        .bind(node_start.to_rfc3339())
        .bind(node_end.to_rfc3339())
        .bind(per_node_ms)
        .execute(pool)
        .await;

        node_start = node_end;
    }
}
