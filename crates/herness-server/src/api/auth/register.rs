use argon2::{
    password_hash::{rand_core::OsRng, PasswordHasher, SaltString},
    Argon2,
};
use axum::extract::State;
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::Json;
use serde::{Deserialize, Serialize};

use herness_common::db::pool::DbPool;
use herness_common::utils::id::generate_id;

use super::super::middleware::create_jwt;

#[derive(Debug, Deserialize)]
pub struct RegisterRequest {
    pub username: String,
    pub email: String,
    pub password: String,
}

#[derive(Debug, Serialize)]
pub struct RegisterResponse {
    pub token: String,
    pub user_id: String,
}

pub async fn register(
    State(pool): State<DbPool>,
    Json(req): Json<RegisterRequest>,
) -> Result<impl IntoResponse, StatusCode> {
    if req.username.is_empty() || req.password.len() < 6 {
        return Err(StatusCode::BAD_REQUEST);
    }

    // Hash password
    let salt = SaltString::generate(&mut OsRng);
    let password_hash = Argon2::default()
        .hash_password(req.password.as_bytes(), &salt)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
        .to_string();

    let user_id = generate_id();

    let result = sqlx::query(
        "INSERT INTO users (id, username, email, password_hash) VALUES (?, ?, ?, ?)",
    )
    .bind(&user_id)
    .bind(&req.username)
    .bind(&req.email)
    .bind(&password_hash)
    .execute(&pool)
    .await;

    match result {
        Ok(_) => {
            let secret = std::env::var("JWT_SECRET")
                .unwrap_or_else(|_| "dev-secret-change-in-production".into());
            let token = create_jwt(&user_id, &secret)
                .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

            Ok((StatusCode::CREATED, Json(RegisterResponse { token, user_id })))
        }
        Err(e) => {
            if let Some(db_err) = e.as_database_error() {
                if db_err.message().contains("UNIQUE") {
                    return Err(StatusCode::CONFLICT);
                }
            }
            Err(StatusCode::INTERNAL_SERVER_ERROR)
        }
    }
}

#[cfg(test)]
mod tests {
    #[tokio::test]
    async fn test_register_endpoint() {
        // Integration test: requires running database
    }
}
