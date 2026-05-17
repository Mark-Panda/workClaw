use async_trait::async_trait;
use serde_json::Value;
use tracing::warn;

use crate::engine::context::ExecutionContext;
use crate::interceptor::Interceptor;
use herness_common::error::{AppError, AppResult};

pub struct AuthInterceptor;

#[async_trait]
impl Interceptor for AuthInterceptor {
    fn interceptor_type(&self) -> &'static str {
        "auth"
    }

    async fn before(
        &self,
        ctx: &mut ExecutionContext,
        _node_id: &str,
        config: &Value,
    ) -> AppResult<()> {
        let token_key = config
            .get("token_key")
            .and_then(|v| v.as_str())
            .unwrap_or("auth_token");

        let required = config
            .get("required")
            .and_then(|v| v.as_bool())
            .unwrap_or(true);

        let token = ctx
            .get_var(token_key)
            .and_then(|v| v.as_str())
            .map(|s| s.to_string());

        match token {
            Some(token) => {
                if let Some(validate_url) = config
                    .get("validate_url")
                    .and_then(|v| v.as_str())
                {
                    let client = reqwest::Client::new();
                    match client
                        .post(validate_url)
                        .json(&serde_json::json!({"token": token}))
                        .send()
                        .await
                    {
                        Ok(resp) if resp.status().is_success() => Ok(()),
                        Ok(resp) => {
                            warn!(
                                "Auth validation failed with status: {}",
                                resp.status()
                            );
                            Err(AppError::Unauthorized)
                        }
                        Err(e) => {
                            warn!("Auth validation request failed: {}", e);
                            Err(AppError::Unauthorized)
                        }
                    }
                } else {
                    Ok(())
                }
            }
            None if required => {
                warn!("Auth token '{}' not found in context", token_key);
                Err(AppError::Unauthorized)
            }
            None => Ok(()),
        }
    }
}
