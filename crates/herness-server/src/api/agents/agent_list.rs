use axum::extract::State;
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::{Extension, Json};
use serde::Serialize;
use sqlx::Row;

use herness_common::db::pool::DbPool;

use super::super::middleware::Claims;

#[derive(Debug, Serialize)]
pub struct AgentItem {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub config: serde_json::Value,
    pub status: String,
}

pub async fn list_agents(
    State(pool): State<DbPool>,
    Extension(claims): Extension<Claims>,
) -> Result<impl IntoResponse, StatusCode> {
    let rows = sqlx::query(
        "SELECT id, name, description, config_json, status FROM agents WHERE user_id = ? ORDER BY created_at DESC",
    )
    .bind(&claims.sub)
    .fetch_all(&pool)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let agents: Vec<AgentItem> = rows
        .iter()
        .map(|r| {
            let config_str: String = r.get(3);
            AgentItem {
                id: r.get(0),
                name: r.get(1),
                description: r.get(2),
                config: serde_json::from_str(&config_str).unwrap_or_default(),
                status: r.get(4),
            }
        })
        .collect();

    Ok(Json(serde_json::json!({ "agents": agents })))
}
