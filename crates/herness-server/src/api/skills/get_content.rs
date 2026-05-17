use axum::extract::Path;
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::Json;

use crate::config::get_skills_dir;

pub async fn get_skill_content(Path(name): Path<String>) -> Result<impl IntoResponse, StatusCode> {
    let skill_md = get_skills_dir().join(&name).join("SKILL.md");

    if !skill_md.exists() {
        return Err(StatusCode::NOT_FOUND);
    }

    let content = std::fs::read_to_string(&skill_md)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    Ok(Json(serde_json::json!({
        "name": name,
        "content": content,
    })))
}
