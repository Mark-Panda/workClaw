use axum::extract::Path;
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::Json;
use serde_json::json;

pub async fn list_tasks(Path(_column_id): Path<String>) -> impl IntoResponse {
    (StatusCode::OK, Json(json!({"tasks": []})))
}
