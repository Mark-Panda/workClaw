use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::{Extension, Json};
use serde::Deserialize;
use sqlx::Row;

use herness_common::types::RuleStatus;
use herness_rule::dsl::parser;
use herness_rule::dsl::validator;

use super::super::middleware::Claims;
use super::super::router::AppState;

#[derive(Debug, Deserialize)]
pub struct ToggleRequest {
    pub enabled: bool,
}

pub async fn toggle_rule(
    State(state): State<AppState>,
    Extension(claims): Extension<Claims>,
    Path(id): Path<String>,
    Json(req): Json<ToggleRequest>,
) -> Result<impl IntoResponse, StatusCode> {
    let pool = &state.pool;

    // 1. Fetch current chain
    let row = sqlx::query(
        "SELECT id, status, dsl_json FROM rule_chains WHERE id = ? AND user_id = ?",
    )
    .bind(&id)
    .bind(&claims.sub)
    .fetch_optional(pool)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
    .ok_or(StatusCode::NOT_FOUND)?;

    let current_status_str: String = row.get(1);
    let current_status: RuleStatus = current_status_str
        .parse()
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let target_status = if req.enabled {
        RuleStatus::Enabled
    } else {
        RuleStatus::Disabled
    };

    // 2. Idempotent: already in target state
    if current_status == target_status {
        return Ok(Json(serde_json::json!({
            "id": id,
            "status": current_status.to_string()
        })));
    }

    // 3. Validate transition
    if !current_status.can_transition_to(&target_status) {
        return Err(StatusCode::CONFLICT);
    }

    // 4. If enabling, validate DSL first (before DB write)
    let chain_to_cache = if req.enabled {
        let dsl_str: String = row.get(2);
        let chain = parser::parse(&dsl_str).map_err(|_| StatusCode::BAD_REQUEST)?;
        validator::validate(&chain).map_err(|_| StatusCode::BAD_REQUEST)?;
        Some(chain)
    } else {
        None
    };

    // 5. Persist status change FIRST — DB is source of truth
    sqlx::query(
        "UPDATE rule_chains SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
    )
    .bind(target_status.to_string())
    .bind(&id)
    .execute(pool)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    // 6. Update cache AFTER successful DB write
    if let Some(chain) = chain_to_cache {
        state.rule_engine.cache_chain(chain);
    } else {
        state.rule_engine.uncache_chain(&id);
    }

    Ok(Json(serde_json::json!({
        "id": id,
        "status": target_status.to_string()
    })))
}
