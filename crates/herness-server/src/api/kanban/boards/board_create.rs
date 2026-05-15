use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::Json;
use serde_json::{json, Value};

pub async fn create_board(Json(_body): Json<Value>) -> impl IntoResponse {
    (StatusCode::CREATED, Json(json!({"id": "new-board-1"})))
}
