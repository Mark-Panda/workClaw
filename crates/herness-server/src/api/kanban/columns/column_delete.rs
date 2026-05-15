use axum::extract::Path;
use axum::http::StatusCode;
use axum::response::IntoResponse;

pub async fn delete_column(Path(_id): Path<String>) -> impl IntoResponse {
    StatusCode::NO_CONTENT
}
