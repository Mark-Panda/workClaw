use axum::extract::State;
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::{Extension, Json};
use serde::{Deserialize, Serialize};

use herness_common::db::pool::DbPool;
use herness_common::utils::id::generate_id;

use super::super::middleware::Claims;

#[derive(Debug, Deserialize)]
pub struct CreateAgentRequest {
    pub name: String,
    pub description: Option<String>,
    pub config: Option<serde_json::Value>,
}

#[derive(Debug, Serialize)]
pub struct CreateAgentResponse {
    pub id: String,
}

pub async fn create_agent(
    State(pool): State<DbPool>,
    Extension(claims): Extension<Claims>,
    Json(req): Json<CreateAgentRequest>,
) -> Result<impl IntoResponse, StatusCode> {
    let id = generate_id();
    let default_config = serde_json::json!({
        "model": "claude-sonnet-4-6",
        "system_prompt": "You are a helpful AI assistant.",
        "temperature": 0.7,
        "max_tokens": 4096
    });
    let config_json = serde_json::to_string(&req.config.unwrap_or(default_config))
        .map_err(|_| StatusCode::BAD_REQUEST)?;

    sqlx::query(
        "INSERT INTO agents (id, name, description, config_json, status, user_id) VALUES (?, ?, ?, ?, 'stopped', ?)",
    )
    .bind(&id)
    .bind(&req.name)
    .bind(&req.description)
    .bind(&config_json)
    .bind(&claims.sub)
    .execute(&pool)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    Ok((StatusCode::CREATED, Json(CreateAgentResponse { id })))
}
