use axum::extract::Request;
use axum::http::{header, StatusCode};
use axum::middleware::Next;
use axum::response::Response;
use jsonwebtoken::{decode, DecodingKey, Validation};
use serde::{Deserialize, Serialize};

const DEFAULT_JWT_SECRET: &str = "dev-secret-change-in-production";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Claims {
    pub sub: String,
    pub exp: usize,
}

pub fn create_jwt(user_id: &str, secret: &str) -> Result<String, jsonwebtoken::errors::Error> {
    let exp = chrono::Utc::now()
        .checked_add_signed(chrono::Duration::hours(24))
        .expect("valid timestamp")
        .timestamp() as usize;

    let claims = Claims {
        sub: user_id.to_string(),
        exp,
    };

    jsonwebtoken::encode(
        &jsonwebtoken::Header::default(),
        &claims,
        &jsonwebtoken::EncodingKey::from_secret(secret.as_bytes()),
    )
}

pub fn verify_jwt(token: &str, secret: &str) -> Result<Claims, jsonwebtoken::errors::Error> {
    decode::<Claims>(
        token,
        &DecodingKey::from_secret(secret.as_bytes()),
        &Validation::default(),
    )
    .map(|data| data.claims)
}

/// Get the JWT secret from environment, warning if using default.
pub fn get_jwt_secret() -> String {
    let secret = std::env::var("JWT_SECRET").unwrap_or_else(|_| DEFAULT_JWT_SECRET.to_string());
    if secret == DEFAULT_JWT_SECRET {
        tracing::warn!(
            "⚠️  JWT_SECRET is using the default value. Set JWT_SECRET env var in production!"
        );
    }
    secret
}

/// JWT authentication middleware.
/// Extracts Bearer token, validates it, and injects Claims via request extension.
pub async fn auth_middleware(mut request: Request, next: Next) -> Result<Response, StatusCode> {
    let auth_header = request
        .headers()
        .get(header::AUTHORIZATION)
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.strip_prefix("Bearer "));

    let token = match auth_header {
        Some(t) => t,
        None => return Err(StatusCode::UNAUTHORIZED),
    };

    let secret = get_jwt_secret();
    let claims = verify_jwt(token, &secret).map_err(|_| StatusCode::UNAUTHORIZED)?;

    request.extensions_mut().insert(claims);
    Ok(next.run(request).await)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_jwt_roundtrip() {
        let secret = "test-secret";
        let token = create_jwt("user-123", secret).unwrap();
        let claims = verify_jwt(&token, secret).unwrap();
        assert_eq!(claims.sub, "user-123");
    }

    #[test]
    fn test_verify_invalid_token() {
        let result = verify_jwt("not.a.valid.token", "secret");
        assert!(result.is_err());
    }

    #[test]
    fn test_verify_wrong_secret() {
        let token = create_jwt("user-1", "secret-a").unwrap();
        let result = verify_jwt(&token, "secret-b");
        assert!(result.is_err());
    }
}
