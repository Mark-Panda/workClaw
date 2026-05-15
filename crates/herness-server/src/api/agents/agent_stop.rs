use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::{Extension, Json};
use serde::Serialize;

use herness_common::db::pool::DbPool;

use super::super::middleware::Claims;

#[derive(Debug, Serialize)]
pub struct StopAgentResponse {
    pub agent_id: String,
    pub status: String,
}

pub async fn stop_agent(
    State(pool): State<DbPool>,
    Extension(claims): Extension<Claims>,
    Path(id): Path<String>,
) -> Result<impl IntoResponse, StatusCode> {
    let result = sqlx::query(
        "UPDATE agents SET status = 'stopped', updated_at = datetime('now') WHERE id = ? AND user_id = ? AND status = 'running'",
    )
    .bind(&id)
    .bind(&claims.sub)
    .execute(&pool)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    if result.rows_affected() == 0 {
        return Err(StatusCode::CONFLICT);
    }

    Ok(Json(StopAgentResponse {
        agent_id: id,
        status: "stopped".into(),
    }))
}
