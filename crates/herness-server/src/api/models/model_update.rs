use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::Json;
use serde::Deserialize;

use herness_common::db::pool::DbPool;

#[derive(Debug, Deserialize)]
pub struct UpdateModelRequest {
    pub model_name: Option<String>,
    pub display_name: Option<String>,
    pub max_tokens: Option<i64>,
    pub temperature: Option<f64>,
    pub is_default: Option<bool>,
}

pub async fn update_model(
    State(pool): State<DbPool>,
    Path(id): Path<String>,
    Json(req): Json<UpdateModelRequest>,
) -> Result<impl IntoResponse, StatusCode> {
    let provider_id: Option<String> =
        sqlx::query_scalar("SELECT provider_id FROM llm_models WHERE id = ?")
            .bind(&id)
            .fetch_optional(&pool)
            .await
            .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
            .flatten();

    let provider_id = provider_id.ok_or(StatusCode::NOT_FOUND)?;

    if req.is_default == Some(true) {
        sqlx::query("UPDATE llm_models SET is_default = 0 WHERE provider_id = ?")
            .bind(&provider_id)
            .execute(&pool)
            .await
            .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    }

    if let Some(model_name) = &req.model_name {
        sqlx::query(
            "UPDATE llm_models SET model_name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
        )
        .bind(model_name.trim())
        .bind(&id)
        .execute(&pool)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    }
    if let Some(display_name) = &req.display_name {
        sqlx::query(
            "UPDATE llm_models SET display_name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
        )
        .bind(display_name)
        .bind(&id)
        .execute(&pool)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    }
    if let Some(max_tokens) = req.max_tokens {
        sqlx::query(
            "UPDATE llm_models SET max_tokens = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
        )
        .bind(max_tokens)
        .bind(&id)
        .execute(&pool)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    }
    if let Some(temperature) = req.temperature {
        sqlx::query(
            "UPDATE llm_models SET temperature = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
        )
        .bind(temperature)
        .bind(&id)
        .execute(&pool)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    }
    if let Some(is_default) = req.is_default {
        sqlx::query(
            "UPDATE llm_models SET is_default = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
        )
        .bind(is_default)
        .bind(&id)
        .execute(&pool)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    }

    Ok(Json(serde_json::json!({ "ok": true })))
}
