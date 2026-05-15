use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::Json;
use serde::Deserialize;

use herness_common::db::pool::DbPool;

#[derive(Debug, Deserialize)]
pub struct UpdateProviderRequest {
    pub name: Option<String>,
    pub provider_type: Option<String>,
    pub base_url: Option<String>,
    pub api_key: Option<String>,
    pub is_default: Option<bool>,
}

pub async fn update_provider(
    State(pool): State<DbPool>,
    Path(id): Path<String>,
    Json(req): Json<UpdateProviderRequest>,
) -> Result<impl IntoResponse, StatusCode> {
    // Check provider exists
    let exists = sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM llm_providers WHERE id = ?")
        .bind(&id)
        .fetch_one(&pool)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
        > 0;

    if !exists {
        return Err(StatusCode::NOT_FOUND);
    }

    // If setting as default, unset others
    if req.is_default == Some(true) {
        sqlx::query("UPDATE llm_providers SET is_default = 0")
            .execute(&pool)
            .await
            .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    }

    if let Some(name) = &req.name {
        sqlx::query("UPDATE llm_providers SET name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
            .bind(name.trim())
            .bind(&id)
            .execute(&pool)
            .await
            .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    }
    if let Some(provider_type) = &req.provider_type {
        sqlx::query("UPDATE llm_providers SET provider_type = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
            .bind(provider_type)
            .bind(&id)
            .execute(&pool)
            .await
            .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    }
    if let Some(base_url) = &req.base_url {
        sqlx::query("UPDATE llm_providers SET base_url = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
            .bind(base_url)
            .bind(&id)
            .execute(&pool)
            .await
            .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    }
    if let Some(api_key) = &req.api_key {
        sqlx::query("UPDATE llm_providers SET api_key = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
            .bind(api_key)
            .bind(&id)
            .execute(&pool)
            .await
            .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    }
    if let Some(is_default) = req.is_default {
        sqlx::query("UPDATE llm_providers SET is_default = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
            .bind(is_default)
            .bind(&id)
            .execute(&pool)
            .await
            .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    }

    Ok(Json(serde_json::json!({ "ok": true })))
}
