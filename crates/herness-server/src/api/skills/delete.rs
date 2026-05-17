use axum::extract::Path;
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::Json;

use crate::config::get_skills_dir;

pub async fn delete_skill(Path(name): Path<String>) -> Result<impl IntoResponse, StatusCode> {
    let skill_dir = get_skills_dir().join(&name);

    if !skill_dir.is_dir() {
        return Err(StatusCode::NOT_FOUND);
    }

    std::fs::remove_dir_all(&skill_dir).map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    Ok(Json(serde_json::json!({ "ok": true })))
}
