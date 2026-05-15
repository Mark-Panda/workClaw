use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::Json;
use serde_json::{json, Value};

pub async fn create_rule(Json(_body): Json<Value>) -> impl IntoResponse {
    (StatusCode::CREATED, Json(json!({"id": "new-rule-1"})))
}
