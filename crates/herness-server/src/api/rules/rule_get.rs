use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::{Extension, Json};
use serde::Serialize;
use serde_json::Value;
use sqlx::Row;

use herness_common::db::pool::DbPool;

use super::super::middleware::Claims;

#[derive(Debug, Serialize)]
pub struct RuleResponse {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub dsl: Value,
    pub canvas_state: Option<Value>,
    pub version: i64,
    pub status: String,
    pub created_at: String,
    pub updated_at: String,
}

pub async fn get_rule(
    State(pool): State<DbPool>,
    Extension(claims): Extension<Claims>,
    Path(id): Path<String>,
) -> Result<impl IntoResponse, StatusCode> {
    let row = sqlx::query(
        "SELECT id, name, description, dsl_json, canvas_json, version, status, created_at, updated_at FROM rule_chains WHERE id = ? AND user_id = ?",
    )
    .bind(&id)
    .bind(&claims.sub)
    .fetch_optional(&pool)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
    .ok_or(StatusCode::NOT_FOUND)?;

    let dsl_str: String = row.get(3);
    let dsl: Value = serde_json::from_str(&dsl_str).unwrap_or_default();
    let canvas_str: Option<String> = row.get(4);
    let canvas_state: Option<Value> =
        canvas_str.and_then(|s| serde_json::from_str(&s).ok());

    Ok(Json(RuleResponse {
        id: row.get(0),
        name: row.get(1),
        description: row.get(2),
        dsl,
        canvas_state,
        version: row.get(5),
        status: row.get(6),
        created_at: row.get(7),
        updated_at: row.get(8),
    }))
}
