use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;
use std::time::Duration;

use crate::node::traits::{NodeContext, NodeHandler, NodeOutput};
use herness_common::error::{AppError, AppResult};

#[derive(Debug, Serialize, Deserialize)]
struct NotificationConfig {
    webhook_url: String,
    template: Option<String>,
    headers: Option<HashMap<String, String>>,
}

pub struct NotificationNode;

#[async_trait]
impl NodeHandler for NotificationNode {
    fn node_type(&self) -> &'static str {
        "notification"
    }

    async fn execute(&self, ctx: &mut NodeContext, config: Value) -> AppResult<NodeOutput> {
        let cfg: NotificationConfig =
            serde_json::from_value(config).map_err(|e| AppError::Validation(e.to_string()))?;

        let client = reqwest::Client::builder()
            .timeout(Duration::from_secs(10))
            .build()
            .map_err(|e| AppError::RuleExecution(format!("Failed to build HTTP client: {}", e)))?;

        let body = cfg
            .template
            .as_ref()
            .map(|t| substitute_placeholders(t, ctx))
            .unwrap_or_else(|| ctx.input.to_string());

        let mut req = client.post(&cfg.webhook_url).header("Content-Type", "application/json");

        if let Some(headers) = &cfg.headers {
            for (key, value) in headers {
                let resolved = substitute_placeholders(value, ctx);
                req = req.header(key.as_str(), resolved);
            }
        }

        match req.body(body).send().await {
            Ok(_) => {
                ctx.set_var("notification_sent", Value::Bool(true));
            }
            Err(e) => {
                tracing::warn!("Notification webhook failed: {}", e);
                ctx.set_var("notification_sent", Value::Bool(false));
            }
        }

        Ok(NodeOutput::Continue)
    }

    fn validate_config(&self, config: &Value) -> AppResult<()> {
        let url = config
            .get("webhook_url")
            .and_then(|v| v.as_str())
            .unwrap_or("");
        if url.trim().is_empty() {
            return Err(AppError::Validation("webhook_url must not be empty".into()));
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
    async fn test_notification_requires_webhook_url() {
        let node = NotificationNode;
        let result = node.validate_config(&serde_json::json!({"webhook_url": ""}));
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_notification_continues_on_any_result() {
        let node = NotificationNode;
        let mut ctx = NodeContext::new(serde_json::json!({"message": "hello"}));
        let config =
            serde_json::json!({"webhook_url": "http://0.0.0.0:0/notify", "template": "{{message}}"});
        let result = node.execute(&mut ctx, config).await.unwrap();
        match result {
            NodeOutput::Continue => {
                // notification_sent is set regardless of success/failure
                assert!(ctx.get_var("notification_sent").is_some());
            }
            _ => panic!("Expected Continue"),
        }
    }
}
