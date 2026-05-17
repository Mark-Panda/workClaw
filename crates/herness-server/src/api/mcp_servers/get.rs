use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::Json;

use herness_common::db::pool::DbPool;

pub async fn get_mcp_server(
    State(pool): State<DbPool>,
    Path(id): Path<String>,
) -> Result<impl IntoResponse, StatusCode> {
    let row = sqlx::query_as::<_, (String, String, String, Option<String>, Option<String>, Option<String>, Option<String>, bool)>(
        "SELECT id, name, transport, command, args_json, url, env_json, enabled FROM mcp_servers WHERE id = ?",
    )
    .bind(&id)
    .fetch_optional(&pool)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
    .ok_or(StatusCode::NOT_FOUND)?;

    Ok(Json(serde_json::json!({
        "id": row.0,
        "name": row.1,
        "transport": row.2,
        "command": row.3,
        "args_json": row.4,
        "url": row.5,
        "env_json": row.6,
        "enabled": row.7,
    })))
}
