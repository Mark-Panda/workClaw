use axum::extract::Path;
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::Json;
use serde_json::{json, Value};

pub async fn create_column(
    Path(_board_id): Path<String>,
    Json(_body): Json<Value>,
) -> impl IntoResponse {
    (StatusCode::CREATED, Json(json!({"id": "new-column-1"})))
}
