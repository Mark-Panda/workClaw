use axum::extract::State;
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::Json;
use serde::Deserialize;

use herness_common::db::pool::DbPool;
use herness_common::utils::id::generate_id;

#[derive(Debug, Deserialize)]
pub struct CreateProviderRequest {
    pub name: String,
    #[serde(default = "default_provider_type")]
    pub provider_type: String,
    pub base_url: Option<String>,
    #[serde(default)]
    pub api_key: String,
    #[serde(default)]
    pub is_default: bool,
}

fn default_provider_type() -> String {
    "anthropic".into()
}

pub async fn create_provider(
    State(pool): State<DbPool>,
    Json(req): Json<CreateProviderRequest>,
) -> Result<impl IntoResponse, StatusCode> {
    if req.name.trim().is_empty() {
        return Err(StatusCode::BAD_REQUEST);
    }

    let id = generate_id();

    // If this is set as default, unset all other defaults
    if req.is_default {
        sqlx::query("UPDATE llm_providers SET is_default = 0")
            .execute(&pool)
            .await
            .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    }

    sqlx::query(
        "INSERT INTO llm_providers (id, name, provider_type, base_url, api_key, is_default) VALUES (?, ?, ?, ?, ?, ?)",
    )
    .bind(&id)
    .bind(req.name.trim())
    .bind(&req.provider_type)
    .bind(&req.base_url)
    .bind(&req.api_key)
    .bind(req.is_default)
    .execute(&pool)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    Ok((StatusCode::CREATED, Json(serde_json::json!({ "id": id }))))
}
