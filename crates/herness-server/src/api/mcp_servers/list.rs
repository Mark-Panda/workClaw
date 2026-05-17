use axum::extract::State;
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::Json;
use serde::Serialize;

use herness_common::db::pool::DbPool;

#[derive(Debug, Serialize)]
pub struct McpServerItem {
    pub id: String,
    pub name: String,
    pub transport: String,
    pub command: Option<String>,
    pub args_json: Option<String>,
    pub url: Option<String>,
    pub env_json: Option<String>,
    pub enabled: bool,
}

pub async fn list_mcp_servers(
    State(pool): State<DbPool>,
) -> Result<impl IntoResponse, StatusCode> {
    let rows = sqlx::query_as::<_, (String, String, String, Option<String>, Option<String>, Option<String>, Option<String>, bool)>(
        "SELECT id, name, transport, command, args_json, url, env_json, enabled FROM mcp_servers ORDER BY name",
    )
    .fetch_all(&pool)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let servers: Vec<McpServerItem> = rows
        .into_iter()
        .map(|(id, name, transport, command, args_json, url, env_json, enabled)| McpServerItem {
            id, name, transport, command, args_json, url, env_json, enabled,
        })
        .collect();

    Ok(Json(serde_json::json!({ "mcp_servers": servers })))
}
