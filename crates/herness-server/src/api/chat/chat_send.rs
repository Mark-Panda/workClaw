use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::Json;
use serde_json::{json, Value};

pub async fn send_message(Json(_body): Json<Value>) -> impl IntoResponse {
    (StatusCode::OK, Json(json!({"message_id": "msg-1", "content": "Hello!"})))
}
