use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::{Extension, Json};
use serde::Deserialize;

use herness_common::db::pool::DbPool;

use super::super::middleware::Claims;

#[derive(Debug, Deserialize)]
pub struct UpdateAgentRequest {
    pub name: Option<String>,
    pub description: Option<String>,
    pub config: Option<serde_json::Value>,
}

pub async fn update_agent(
    State(pool): State<DbPool>,
    Extension(claims): Extension<Claims>,
    Path(id): Path<String>,
    Json(req): Json<UpdateAgentRequest>,
) -> Result<impl IntoResponse, StatusCode> {
    let existing = sqlx::query("SELECT id FROM agents WHERE id = ? AND user_id = ?")
        .bind(&id)
        .bind(&claims.sub)
        .fetch_optional(&pool)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    if existing.is_none() {
        return Err(StatusCode::NOT_FOUND);
    }

    if let Some(name) = &req.name {
        sqlx::query("UPDATE agents SET name = ?, updated_at = datetime('now') WHERE id = ?")
            .bind(name)
            .bind(&id)
            .execute(&pool)
            .await
            .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    }

    if let Some(desc) = &req.description {
        sqlx::query(
            "UPDATE agents SET description = ?, updated_at = datetime('now') WHERE id = ?",
        )
        .bind(desc)
        .bind(&id)
        .execute(&pool)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    }

    if let Some(config) = &req.config {
        let config_str =
            serde_json::to_string(config).map_err(|_| StatusCode::BAD_REQUEST)?;
        sqlx::query(
            "UPDATE agents SET config_json = ?, updated_at = datetime('now') WHERE id = ?",
        )
        .bind(&config_str)
        .bind(&id)
        .execute(&pool)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    }

    Ok(StatusCode::OK)
}
