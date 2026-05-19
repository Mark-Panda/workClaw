use axum::extract::{Query, State};
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::{Extension, Json};
use serde::Deserialize;
use serde_json::Value;
use sqlx::Row;

use super::super::middleware::Claims;
use super::super::router::AppState;

#[derive(Debug, Deserialize)]
pub struct ListRulesQuery {
    pub page: Option<u32>,
    pub page_size: Option<u32>,
}

pub async fn list_rules(
    State(state): State<AppState>,
    Extension(claims): Extension<Claims>,
    Query(query): Query<ListRulesQuery>,
) -> Result<impl IntoResponse, StatusCode> {
    let page = query.page.unwrap_or(1).max(1);
    let page_size = query.page_size.unwrap_or(20).min(100);
    let offset = (page - 1) * page_size;

    let total: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM rule_chains WHERE user_id = ?",
    )
    .bind(&claims.sub)
    .fetch_one(&state.pool)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let rows = sqlx::query(
        "SELECT id, name, description, dsl_json, version, status, created_at, updated_at FROM rule_chains WHERE user_id = ? ORDER BY updated_at DESC LIMIT ? OFFSET ?",
    )
    .bind(&claims.sub)
    .bind(page_size)
    .bind(offset)
    .fetch_all(&state.pool)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let rules: Vec<Value> = rows
        .iter()
        .map(|r| {
            let dsl_str: String = r.get(3);
            let dsl: Value = serde_json::from_str(&dsl_str).unwrap_or_default();
            serde_json::json!({
                "id": r.get::<String, _>(0),
                "name": r.get::<String, _>(1),
                "description": r.get::<Option<String>, _>(2),
                "dsl": dsl,
                "version": r.get::<i64, _>(4),
                "status": r.get::<String, _>(5),
                "created_at": r.get::<String, _>(6),
                "updated_at": r.get::<String, _>(7),
            })
        })
        .collect();

    Ok(Json(serde_json::json!({
        "rules": rules,
        "total": total,
        "page": page,
        "page_size": page_size
    })))
}
