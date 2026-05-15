use axum::http::{header, StatusCode};
use axum::response::IntoResponse;

pub async fn export_logs() -> impl IntoResponse {
    let body = "[]";
    (
        StatusCode::OK,
        [
            (header::CONTENT_TYPE, "application/json"),
            (
                header::CONTENT_DISPOSITION,
                "attachment; filename=\"logs-export.json\"",
            ),
        ],
        body.to_string(),
    )
}
