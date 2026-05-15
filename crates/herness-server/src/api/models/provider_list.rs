use axum::extract::State;
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::Json;
use serde::Serialize;

use herness_common::db::pool::DbPool;

#[derive(Debug, Serialize)]
pub struct ProviderItem {
    pub id: String,
    pub name: String,
    pub provider_type: String,
    pub base_url: Option<String>,
    pub is_default: bool,
    pub model_count: i64,
}

pub async fn list_providers(
    State(pool): State<DbPool>,
) -> Result<impl IntoResponse, StatusCode> {
    let rows = sqlx::query_as::<_, (String, String, String, Option<String>, i64, bool)>(
        r#"SELECT p.id, p.name, p.provider_type, p.base_url,
                  (SELECT COUNT(*) FROM llm_models m WHERE m.provider_id = p.id) as model_count,
                  p.is_default
           FROM llm_providers p
           ORDER BY p.created_at DESC"#,
    )
    .fetch_all(&pool)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let providers: Vec<ProviderItem> = rows
        .into_iter()
        .map(|(id, name, provider_type, base_url, model_count, is_default)| ProviderItem {
            id,
            name,
            provider_type,
            base_url,
            is_default,
            model_count,
        })
        .collect();

    Ok(Json(serde_json::json!({ "providers": providers })))
}
