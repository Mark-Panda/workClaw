use axum::extract::State;
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::Json;
use serde::Deserialize;

use herness_common::db::pool::DbPool;
use herness_common::utils::id::generate_id;

#[derive(Debug, Deserialize)]
pub struct CreateMcpServerRequest {
    pub name: String,
    pub transport: String,
    pub command: Option<String>,
    pub args_json: Option<String>,
    pub url: Option<String>,
    pub env_json: Option<String>,
    #[serde(default = "default_enabled")]
    pub enabled: bool,
}

fn default_enabled() -> bool { true }

pub async fn create_mcp_server(
    State(pool): State<DbPool>,
    Json(req): Json<CreateMcpServerRequest>,
) -> Result<impl IntoResponse, StatusCode> {
    if req.name.trim().is_empty() {
        return Err(StatusCode::BAD_REQUEST);
    }

    let id = generate_id();
    sqlx::query(
        "INSERT INTO mcp_servers (id, name, transport, command, args_json, url, env_json, enabled) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(&id)
    .bind(req.name.trim())
    .bind(&req.transport)
    .bind(&req.command)
    .bind(&req.args_json)
    .bind(&req.url)
    .bind(&req.env_json)
    .bind(req.enabled)
    .execute(&pool)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    Ok((StatusCode::CREATED, Json(serde_json::json!({ "id": id }))))
}
