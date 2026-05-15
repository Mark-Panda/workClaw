use axum::extract::Path;
use axum::http::StatusCode;
use axum::response::IntoResponse;

pub async fn delete_board(Path(_id): Path<String>) -> impl IntoResponse {
    StatusCode::NO_CONTENT
}
