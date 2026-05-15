use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::Json;
use serde_json::{json, Value};

pub async fn import_rule(Json(dsl): Json<Value>) -> impl IntoResponse {
    let _ = dsl;
    (StatusCode::CREATED, Json(json!({"id": "imported-rule-1"})))
}
