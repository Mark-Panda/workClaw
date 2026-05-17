use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::Json;
use serde::Deserialize;

use herness_common::db::pool::DbPool;

#[derive(Debug, Deserialize)]
pub struct UpdateMcpServerRequest {
    pub name: Option<String>,
    pub transport: Option<String>,
    pub command: Option<String>,
    pub args_json: Option<String>,
    pub url: Option<String>,
    pub env_json: Option<String>,
    pub enabled: Option<bool>,
}

pub async fn update_mcp_server(
    State(pool): State<DbPool>,
    Path(id): Path<String>,
    Json(req): Json<UpdateMcpServerRequest>,
) -> Result<impl IntoResponse, StatusCode> {
    let exists = sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM mcp_servers WHERE id = ?")
        .bind(&id)
        .fetch_one(&pool)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
        > 0;

    if !exists {
        return Err(StatusCode::NOT_FOUND);
    }

    if let Some(name) = &req.name {
        sqlx::query("UPDATE mcp_servers SET name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
            .bind(name.trim())
            .bind(&id)
            .execute(&pool).await.map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    }
    if let Some(t) = &req.transport {
        sqlx::query("UPDATE mcp_servers SET transport = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
            .bind(t).bind(&id)
            .execute(&pool).await.map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    }
    if let Some(c) = &req.command {
        sqlx::query("UPDATE mcp_servers SET command = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
            .bind(c).bind(&id)
            .execute(&pool).await.map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    }
    if let Some(a) = &req.args_json {
        sqlx::query("UPDATE mcp_servers SET args_json = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
            .bind(a).bind(&id)
            .execute(&pool).await.map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    }
    if let Some(u) = &req.url {
        sqlx::query("UPDATE mcp_servers SET url = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
            .bind(u).bind(&id)
            .execute(&pool).await.map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    }
    if let Some(e) = &req.env_json {
        sqlx::query("UPDATE mcp_servers SET env_json = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
            .bind(e).bind(&id)
            .execute(&pool).await.map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    }
    if let Some(en) = req.enabled {
        sqlx::query("UPDATE mcp_servers SET enabled = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
            .bind(en).bind(&id)
            .execute(&pool).await.map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    }

    Ok(Json(serde_json::json!({ "ok": true })))
}
