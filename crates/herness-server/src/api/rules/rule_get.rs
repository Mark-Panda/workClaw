use axum::extract::Path;
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::Json;
use serde_json::json;

pub async fn get_rule(Path(id): Path<String>) -> impl IntoResponse {
    (StatusCode::OK, Json(json!({"id": id})))
}
