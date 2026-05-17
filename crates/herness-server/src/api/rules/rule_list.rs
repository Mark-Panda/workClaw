use axum::extract::State;
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::{Extension, Json};
use serde::Serialize;
use serde_json::Value;
use sqlx::Row;

use herness_common::db::pool::DbPool;

use super::super::middleware::Claims;

#[derive(Debug, Serialize)]
pub struct RuleListItem {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub dsl: Value,
    pub version: i64,
    pub status: String,
    pub created_at: String,
    pub updated_at: String,
}

pub async fn list_rules(
    State(pool): State<DbPool>,
    Extension(claims): Extension<Claims>,
) -> Result<impl IntoResponse, StatusCode> {
    let rows = sqlx::query(
        "SELECT id, name, description, dsl_json, version, status, created_at, updated_at FROM rule_chains WHERE user_id = ? ORDER BY updated_at DESC",
    )
    .bind(&claims.sub)
    .fetch_all(&pool)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let rules: Vec<RuleListItem> = rows
        .iter()
        .map(|r| {
            let dsl_str: String = r.get(3);
            let dsl: Value = serde_json::from_str(&dsl_str).unwrap_or_default();
            RuleListItem {
                id: r.get(0),
                name: r.get(1),
                description: r.get(2),
                dsl,
                version: r.get(4),
                status: r.get(5),
                created_at: r.get(6),
                updated_at: r.get(7),
            }
        })
        .collect();

    Ok(Json(serde_json::json!({ "rules": rules })))
}
