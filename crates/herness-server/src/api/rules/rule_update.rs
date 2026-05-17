use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::{Extension, Json};
use serde::Deserialize;
use serde_json::Value;

use herness_common::db::pool::DbPool;
use herness_rule::dsl::parser;
use herness_rule::dsl::validator;

use super::super::middleware::Claims;

#[derive(Debug, Deserialize)]
pub struct UpdateRuleRequest {
    pub name: Option<String>,
    pub description: Option<String>,
    pub dsl: Option<Value>,
    pub canvas_state: Option<Value>,
    pub status: Option<String>,
}

pub async fn update_rule(
    State(pool): State<DbPool>,
    Extension(claims): Extension<Claims>,
    Path(id): Path<String>,
    Json(req): Json<UpdateRuleRequest>,
) -> Result<impl IntoResponse, StatusCode> {
    let existing = sqlx::query_scalar::<_, String>(
        "SELECT id FROM rule_chains WHERE id = ? AND user_id = ?",
    )
    .bind(&id)
    .bind(&claims.sub)
    .fetch_optional(&pool)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
    .ok_or(StatusCode::NOT_FOUND)?;

    if let Some(name) = &req.name {
        sqlx::query("UPDATE rule_chains SET name = ? WHERE id = ?")
            .bind(name)
            .bind(&existing)
            .execute(&pool)
            .await
            .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    }

    if let Some(desc) = &req.description {
        sqlx::query("UPDATE rule_chains SET description = ? WHERE id = ?")
            .bind(desc)
            .bind(&existing)
            .execute(&pool)
            .await
            .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    }

    if let Some(dsl) = &req.dsl {
        let dsl_json =
            serde_json::to_string(dsl).map_err(|_| StatusCode::BAD_REQUEST)?;
        let chain = parser::parse(&dsl_json).map_err(|_| StatusCode::BAD_REQUEST)?;
        validator::validate(&chain).map_err(|_| StatusCode::BAD_REQUEST)?;

        sqlx::query("UPDATE rule_chains SET dsl_json = ? WHERE id = ?")
            .bind(&dsl_json)
            .bind(&existing)
            .execute(&pool)
            .await
            .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    }

    if let Some(canvas) = &req.canvas_state {
        let canvas_json =
            serde_json::to_string(canvas).map_err(|_| StatusCode::BAD_REQUEST)?;
        sqlx::query("UPDATE rule_chains SET canvas_json = ? WHERE id = ?")
            .bind(&canvas_json)
            .bind(&existing)
            .execute(&pool)
            .await
            .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    }

    if let Some(status) = &req.status {
        sqlx::query("UPDATE rule_chains SET status = ? WHERE id = ?")
            .bind(status)
            .bind(&existing)
            .execute(&pool)
            .await
            .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    }

    sqlx::query(
        "UPDATE rule_chains SET version = version + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
    )
    .bind(&existing)
    .execute(&pool)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    Ok(Json(serde_json::json!({ "id": existing })))
}
