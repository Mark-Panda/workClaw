use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::Json;
use serde::Deserialize;

use herness_common::db::pool::DbPool;
use herness_common::utils::id::generate_id;

#[derive(Debug, Deserialize)]
pub struct AddModelRequest {
    pub model_name: String,
    pub display_name: Option<String>,
    #[serde(default = "default_max_tokens")]
    pub max_tokens: i64,
    #[serde(default = "default_temperature")]
    pub temperature: f64,
    #[serde(default)]
    pub is_default: bool,
}

fn default_max_tokens() -> i64 {
    4096
}
fn default_temperature() -> f64 {
    0.7
}

pub async fn add_model(
    State(pool): State<DbPool>,
    Path(provider_id): Path<String>,
    Json(req): Json<AddModelRequest>,
) -> Result<impl IntoResponse, StatusCode> {
    if req.model_name.trim().is_empty() {
        return Err(StatusCode::BAD_REQUEST);
    }

    // Check provider exists
    let exists = sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM llm_providers WHERE id = ?")
        .bind(&provider_id)
        .fetch_one(&pool)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
        > 0;

    if !exists {
        return Err(StatusCode::NOT_FOUND);
    }

    let id = generate_id();

    if req.is_default {
        sqlx::query("UPDATE llm_models SET is_default = 0 WHERE provider_id = ?")
            .bind(&provider_id)
            .execute(&pool)
            .await
            .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    }

    sqlx::query(
        "INSERT INTO llm_models (id, provider_id, model_name, display_name, max_tokens, temperature, is_default) VALUES (?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(&id)
    .bind(&provider_id)
    .bind(req.model_name.trim())
    .bind(&req.display_name)
    .bind(req.max_tokens)
    .bind(req.temperature)
    .bind(req.is_default)
    .execute(&pool)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    Ok((StatusCode::CREATED, Json(serde_json::json!({ "id": id }))))
}
