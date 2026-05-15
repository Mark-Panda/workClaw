use axum::extract::Path;
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::Json;
use serde_json::json;

pub async fn list_conversations() -> impl IntoResponse {
    (StatusCode::OK, Json(json!({"conversations": []})))
}

pub async fn get_conversation(Path(id): Path<String>) -> impl IntoResponse {
    (StatusCode::OK, Json(json!({"id": id, "messages": []})))
}

pub async fn delete_conversation(Path(_id): Path<String>) -> impl IntoResponse {
    StatusCode::NO_CONTENT
}
