use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::{Extension, Json};
use serde::Serialize;
use sqlx::Row;

use herness_common::db::pool::DbPool;

use super::super::middleware::Claims;

#[derive(Debug, Serialize)]
pub struct AgentDetail {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub config: serde_json::Value,
    pub status: String,
    pub user_id: String,
    pub created_at: String,
    pub updated_at: String,
}

pub async fn get_agent(
    State(pool): State<DbPool>,
    Extension(claims): Extension<Claims>,
    Path(id): Path<String>,
) -> Result<impl IntoResponse, StatusCode> {
    let row = sqlx::query(
        "SELECT id, name, description, config_json, status, user_id, created_at, updated_at FROM agents WHERE id = ? AND user_id = ?",
    )
    .bind(&id)
    .bind(&claims.sub)
    .fetch_optional(&pool)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    match row {
        Some(r) => {
            let config_str: String = r.get(3);
            let detail = AgentDetail {
                id: r.get(0),
                name: r.get(1),
                description: r.get(2),
                config: serde_json::from_str(&config_str).unwrap_or_default(),
                status: r.get(4),
                user_id: r.get(5),
                created_at: r.get::<String, _>(6),
                updated_at: r.get::<String, _>(7),
            };
            Ok(Json(detail).into_response())
        }
        None => Err(StatusCode::NOT_FOUND),
    }
}
