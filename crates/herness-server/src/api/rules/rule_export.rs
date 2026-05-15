use axum::extract::Path;
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::Json;
use serde_json::json;

pub async fn export_rule(Path(id): Path<String>) -> impl IntoResponse {
    let _ = id;
    (StatusCode::OK, Json(json!({"dsl": {}})))
}
