use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::Json;
use serde_json::{json, Value};

pub async fn validate_rule(Json(dsl): Json<Value>) -> impl IntoResponse {
    let _ = dsl;
    (StatusCode::OK, Json(json!({"valid": true, "warnings": []})))
}
