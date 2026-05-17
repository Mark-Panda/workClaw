use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::sync::Arc;
use tokio::sync::Mutex;

use crate::engine::RuleEngine;
use crate::node::traits::{NodeContext, NodeHandler, NodeOutput};
use herness_common::error::{AppError, AppResult};

#[derive(Debug, Serialize, Deserialize)]
struct SubchainConfig {
    subchain_id: String,
    pass_context: Option<bool>,
}

pub struct SubchainNode {
    engine: Mutex<Option<Arc<RuleEngine>>>,
}

impl SubchainNode {
    pub fn new() -> Self {
        Self {
            engine: Mutex::new(None),
        }
    }

    pub async fn set_engine(&self, engine: Arc<RuleEngine>) {
        *self.engine.lock().await = Some(engine);
    }
}

impl Default for SubchainNode {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait]
impl NodeHandler for SubchainNode {
    fn node_type(&self) -> &'static str {
        "subchain"
    }

    async fn execute(&self, ctx: &mut NodeContext, config: Value) -> AppResult<NodeOutput> {
        let cfg: SubchainConfig =
            serde_json::from_value(config).map_err(|e| AppError::Validation(e.to_string()))?;

        let engine = self
            .engine
            .lock()
            .await
            .clone()
            .ok_or_else(|| AppError::RuleExecution("SubchainNode: no engine reference configured".into()))?;

        let input = if cfg.pass_context.unwrap_or(false) {
            serde_json::to_value(&ctx.variables)
                .map_err(|e| AppError::RuleExecution(format!("Failed to serialize context: {}", e)))?
        } else {
            ctx.input.clone()
        };

        let result = engine.execute(&cfg.subchain_id, input).await.map_err(|e| {
            AppError::RuleExecution(format!("Subchain '{}' execution failed: {}", cfg.subchain_id, e))
        })?;

        ctx.set_var("subchain_output", result);
        Ok(NodeOutput::Continue)
    }

    fn validate_config(&self, config: &Value) -> AppResult<()> {
        let id = config
            .get("subchain_id")
            .and_then(|v| v.as_str())
            .unwrap_or("");
        if id.trim().is_empty() {
            return Err(AppError::Validation("subchain_id must not be empty".into()));
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_subchain_requires_id() {
        let node = SubchainNode::new();
        let result = node.validate_config(&serde_json::json!({"subchain_id": ""}));
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_subchain_no_engine_errors() {
        let node = SubchainNode::new();
        let mut ctx = NodeContext::new(Value::Null);
        let config = serde_json::json!({"subchain_id": "some-chain"});
        let result = node.execute(&mut ctx, config).await;
        assert!(result.is_err());
    }
}
