use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::Extension;

use super::super::middleware::Claims;
use super::super::router::AppState;

pub async fn delete_rule(
    State(state): State<AppState>,
    Extension(claims): Extension<Claims>,
    Path(id): Path<String>,
) -> Result<impl IntoResponse, StatusCode> {
    let result = sqlx::query("DELETE FROM rule_chains WHERE id = ? AND user_id = ?")
        .bind(&id)
        .bind(&claims.sub)
        .execute(&state.pool)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    if result.rows_affected() == 0 {
        return Err(StatusCode::NOT_FOUND);
    }

    // Remove from engine cache
    state.rule_engine.uncache_chain(&id);

    Ok(StatusCode::NO_CONTENT)
}
