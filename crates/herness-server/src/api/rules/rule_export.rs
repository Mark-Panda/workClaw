use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::{Extension, Json};
use serde_json::Value;
use sqlx::Row;

use herness_common::db::pool::DbPool;

use super::super::middleware::Claims;

pub async fn export_rule(
    State(pool): State<DbPool>,
    Extension(claims): Extension<Claims>,
    Path(id): Path<String>,
) -> Result<impl IntoResponse, StatusCode> {
    let row = sqlx::query(
        "SELECT name, description, dsl_json FROM rule_chains WHERE id = ? AND user_id = ?",
    )
    .bind(&id)
    .bind(&claims.sub)
    .fetch_optional(&pool)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
    .ok_or(StatusCode::NOT_FOUND)?;

    let name: String = row.get(0);
    let description: Option<String> = row.get(1);
    let dsl_str: String = row.get(2);
    let dsl: Value = serde_json::from_str(&dsl_str).unwrap_or_default();

    Ok(Json(serde_json::json!({
        "name": name,
        "description": description,
        "dsl": dsl
    })))
}
