use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;
use std::time::Duration;

use crate::node::traits::{NodeContext, NodeHandler, NodeOutput};
use herness_common::error::{AppError, AppResult};

#[derive(Debug, Serialize, Deserialize)]
struct RestClientConfig {
    url: String,
    method: Option<String>,
    body_template: Option<String>,
    timeout_ms: Option<u64>,
    headers: Option<HashMap<String, String>>,
}

pub struct RestClientNode;

#[async_trait]
impl NodeHandler for RestClientNode {
    fn node_type(&self) -> &'static str {
        "rest_client"
    }

    async fn execute(&self, ctx: &mut NodeContext, config: Value) -> AppResult<NodeOutput> {
        let cfg: RestClientConfig =
            serde_json::from_value(config).map_err(|e| AppError::Validation(e.to_string()))?;

        let method = cfg
            .method
            .unwrap_or_else(|| "GET".to_string())
            .to_uppercase();

        let timeout = Duration::from_millis(cfg.timeout_ms.unwrap_or(30000));
        let client = reqwest::Client::builder()
            .timeout(timeout)
            .build()
            .map_err(|e| AppError::RuleExecution(format!("Failed to build HTTP client: {}", e)))?;

        let url = substitute_placeholders(&cfg.url, ctx);

        let mut req = match method.as_str() {
            "GET" => client.get(&url),
            "POST" => client.post(&url),
            "PUT" => client.put(&url),
            "DELETE" => client.delete(&url),
            "PATCH" => client.patch(&url),
            "HEAD" => client.head(&url),
            _ => {
                return Err(AppError::Validation(format!(
                    "Unsupported HTTP method: {}",
                    method
                )))
            }
        };

        if let Some(headers) = &cfg.headers {
            for (key, value) in headers {
                let resolved = substitute_placeholders(value, ctx);
                req = req.header(key.as_str(), resolved);
            }
        }

        if let Some(body_template) = &cfg.body_template {
            let body = substitute_placeholders(body_template, ctx);
            req = req.header("Content-Type", "application/json");
            req = req.body(body);
        }

        match req.send().await {
            Ok(resp) => {
                let status = resp.status().as_u16();
                ctx.set_var("rest_client_status", Value::Number(status.into()));

                match resp.text().await {
                    Ok(text) => {
                        let body_val: Value =
                            serde_json::from_str(&text).unwrap_or(Value::String(text));
                        ctx.set_var("rest_client_body", body_val);
                    }
                    Err(_) => {
                        ctx.set_var("rest_client_body", Value::Null);
                    }
                }
                Ok(NodeOutput::Continue)
            }
            Err(e) => Err(AppError::RuleExecution(format!(
                "HTTP request failed: {}",
                e
            ))),
        }
    }

    fn validate_config(&self, config: &Value) -> AppResult<()> {
        let url = config.get("url").and_then(|v| v.as_str()).unwrap_or("");
        if url.trim().is_empty() {
            return Err(AppError::Validation("url must not be empty".into()));
        }
        Ok(())
    }
}

fn substitute_placeholders(template: &str, ctx: &NodeContext) -> String {
    let mut result = template.to_string();
    for (key, value) in &ctx.variables {
        let placeholder = format!("{{{{{}}}}}", key);
        let replacement = match value {
            Value::String(s) => s.clone(),
            _ => value.to_string(),
        };
        result = result.replace(&placeholder, &replacement);
    }
    result
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_rest_client_requires_url() {
        let node = RestClientNode;
        let result = node.validate_config(&serde_json::json!({"url": ""}));
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_rest_client_invalid_url_fails() {
        let node = RestClientNode;
        let mut ctx = NodeContext::new(Value::Null);
        let config = serde_json::json!({"url": "not-a-valid-url", "timeout_ms": 100});
        let result = node.execute(&mut ctx, config).await;
        assert!(result.is_err());
    }
}
