use async_trait::async_trait;
use serde_json::Value;

use crate::engine::context::ExecutionContext;
use crate::interceptor::Interceptor;
use herness_common::error::{AppError, AppResult};

pub struct ValidationInterceptor;

#[async_trait]
impl Interceptor for ValidationInterceptor {
    fn interceptor_type(&self) -> &'static str {
        "validation"
    }

    async fn before(
        &self,
        ctx: &mut ExecutionContext,
        _node_id: &str,
        config: &Value,
    ) -> AppResult<()> {
        let rules = config
            .get("rules")
            .and_then(|v| v.as_array())
            .cloned()
            .unwrap_or_default();

        for rule in &rules {
            let field = rule
                .get("field")
                .and_then(|v| v.as_str())
                .unwrap_or("");
            let rule_type = rule
                .get("rule")
                .and_then(|v| v.as_str())
                .unwrap_or("");
            let message = rule
                .get("message")
                .and_then(|v| v.as_str())
                .unwrap_or("Validation failed");

            let value = ctx
                .get_var(field)
                .or_else(|| ctx.input.get(field));

            match rule_type {
                "required" => {
                    if value.is_none() || value == Some(&Value::Null) {
                        return Err(AppError::Validation(message.to_string()));
                    }
                }
                "min_length" => {
                    let min = rule
                        .get("min")
                        .and_then(|v| v.as_u64())
                        .unwrap_or(0) as usize;
                    if let Some(Value::String(s)) = value {
                        if s.len() < min {
                            return Err(AppError::Validation(message.to_string()));
                        }
                    } else if let Some(Value::Array(arr)) = value {
                        if arr.len() < min {
                            return Err(AppError::Validation(message.to_string()));
                        }
                    }
                }
                "max_length" => {
                    let max = rule
                        .get("max")
                        .and_then(|v| v.as_u64())
                        .unwrap_or(usize::MAX as u64) as usize;
                    if let Some(Value::String(s)) = value {
                        if s.len() > max {
                            return Err(AppError::Validation(message.to_string()));
                        }
                    } else if let Some(Value::Array(arr)) = value {
                        if arr.len() > max {
                            return Err(AppError::Validation(message.to_string()));
                        }
                    }
                }
                "contains" => {
                    let pattern = rule
                        .get("pattern")
                        .and_then(|v| v.as_str())
                        .unwrap_or("");
                    if let Some(Value::String(s)) = value {
                        if !s.contains(pattern) {
                            return Err(AppError::Validation(message.to_string()));
                        }
                    }
                }
                "type" => {
                    let expected = rule
                        .get("expected")
                        .and_then(|v| v.as_str())
                        .unwrap_or("");
                    let valid = match expected {
                        "string" => value.map_or(false, |v| v.is_string()),
                        "number" => value.map_or(false, |v| v.is_number()),
                        "bool" => value.map_or(false, |v| v.is_boolean()),
                        "array" => value.map_or(false, |v| v.is_array()),
                        "object" => value.map_or(false, |v| v.is_object()),
                        "null" => value.map_or(false, |v| v.is_null()),
                        _ => true,
                    };
                    if !valid {
                        return Err(AppError::Validation(message.to_string()));
                    }
                }
                _ => {}
            }
        }

        Ok(())
    }
}
