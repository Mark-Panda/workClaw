use axum::extract::State;
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::{Extension, Json};
use serde::{Deserialize, Serialize};
use serde_json::Value;

use herness_common::db::pool::DbPool;
use herness_common::utils::id::generate_id;
use herness_rule::dsl::parser;
use herness_rule::dsl::validator;

use super::super::middleware::Claims;

#[derive(Debug, Deserialize)]
pub struct ImportRuleRequest {
    pub name: String,
    pub description: Option<String>,
    pub dsl: Value,
}

#[derive(Debug, Serialize)]
pub struct ImportRuleResponse {
    pub id: String,
}

pub async fn import_rule(
    State(pool): State<DbPool>,
    Extension(claims): Extension<Claims>,
    Json(req): Json<ImportRuleRequest>,
) -> Result<impl IntoResponse, StatusCode> {
    let dsl_json =
        serde_json::to_string(&req.dsl).map_err(|_| StatusCode::BAD_REQUEST)?;

    let chain = parser::parse(&dsl_json).map_err(|e| {
        tracing::warn!("DSL parse error on import: {}", e);
        StatusCode::BAD_REQUEST
    })?;

    validator::validate(&chain).map_err(|_| StatusCode::BAD_REQUEST)?;

    let id = generate_id();

    sqlx::query(
        "INSERT INTO rule_chains (id, name, description, dsl_json, version, status, user_id) VALUES (?, ?, ?, ?, 1, 'draft', ?)",
    )
    .bind(&id)
    .bind(&req.name)
    .bind(&req.description)
    .bind(&dsl_json)
    .bind(&claims.sub)
    .execute(&pool)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    Ok((StatusCode::CREATED, Json(ImportRuleResponse { id })))
}
