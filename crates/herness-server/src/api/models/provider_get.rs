use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::Json;
use serde::Serialize;

use herness_common::db::pool::DbPool;

#[derive(Debug, Serialize)]
pub struct ModelItem {
    pub id: String,
    pub model_name: String,
    pub display_name: Option<String>,
    pub max_tokens: i64,
    pub temperature: f64,
    pub is_default: bool,
}

pub async fn get_provider(
    State(pool): State<DbPool>,
    Path(id): Path<String>,
) -> Result<impl IntoResponse, StatusCode> {
    let provider = sqlx::query_as::<_, (String, String, String, Option<String>, String, bool)>(
        "SELECT id, name, provider_type, base_url, api_key, is_default FROM llm_providers WHERE id = ?",
    )
    .bind(&id)
    .fetch_optional(&pool)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
    .ok_or(StatusCode::NOT_FOUND)?;

    let models = sqlx::query_as::<_, (String, String, Option<String>, i64, f64, bool)>(
        "SELECT id, model_name, display_name, max_tokens, temperature, is_default FROM llm_models WHERE provider_id = ? ORDER BY created_at ASC",
    )
    .bind(&id)
    .fetch_all(&pool)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let model_items: Vec<ModelItem> = models
        .into_iter()
        .map(|(mid, model_name, display_name, max_tokens, temperature, is_default)| {
            ModelItem {
                id: mid,
                model_name,
                display_name,
                max_tokens,
                temperature,
                is_default,
            }
        })
        .collect();

    Ok(Json(serde_json::json!({
        "id": provider.0,
        "name": provider.1,
        "provider_type": provider.2,
        "base_url": provider.3,
        "api_key": provider.4,
        "is_default": provider.5,
        "models": model_items,
    })))
}
