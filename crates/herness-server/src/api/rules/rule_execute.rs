use axum::extract::Path;
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::Json;
use serde_json::{json, Value};

pub async fn execute_rule(Path(id): Path<String>, Json(input): Json<Value>) -> impl IntoResponse {
    let _ = (id, input);
    (StatusCode::OK, Json(json!({"status": "completed", "output": null})))
}
