use async_trait::async_trait;
use serde_json::Value;
use std::sync::Arc;
use tokio::sync::Mutex;

use crate::engine::RuleEngine;
use crate::node::traits::{NodeContext, NodeHandler, NodeOutput};
use herness_common::error::{AppError, AppResult};

/// TryCatch node: executes a try block, and on error executes a catch block.
pub struct TryCatchNode {
    engine: Mutex<Option<Arc<RuleEngine>>>,
}

impl TryCatchNode {
    pub fn new() -> Self {
        Self {
            engine: Mutex::new(None),
        }
    }

    pub async fn set_engine(&self, engine: Arc<RuleEngine>) {
        *self.engine.lock().await = Some(engine);
    }
}

impl Default for TryCatchNode {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait]
impl NodeHandler for TryCatchNode {
    fn node_type(&self) -> &'static str {
        "try_catch"
    }

    async fn execute(&self, ctx: &mut NodeContext, config: Value) -> AppResult<NodeOutput> {
        let engine = self
            .engine
            .lock()
            .await
            .clone()
            .ok_or_else(|| AppError::RuleExecution("TryCatchNode: no engine configured".into()))?;

        let chain_id = ctx.chain_id.clone();
        let try_start = config
            .get("try_start")
            .and_then(|v| v.as_str())
            .unwrap_or("");
        let catch_start = config
            .get("catch_start")
            .and_then(|v| v.as_str())
            .unwrap_or("");

        if try_start.is_empty() {
            return Err(AppError::Validation("try_start must not be empty".into()));
        }

        // Execute try block
        let try_result = engine
            .execute_chain_segment(&chain_id, try_start, "", ctx.clone())
            .await;

        match try_result {
            Ok(try_ctx) => {
                // Try succeeded
                ctx.variables = try_ctx.variables;
                ctx.node_outputs = try_ctx.node_outputs;
                ctx.set_var("try_success", Value::Bool(true));
            }
            Err(e) => {
                // Try failed — execute catch block if configured
                ctx.set_var("try_error", Value::String(e.to_string()));
                ctx.set_var("try_success", Value::Bool(false));

                if !catch_start.is_empty() {
                    let catch_ctx = engine
                        .execute_chain_segment(&chain_id, catch_start, "", ctx.clone())
                        .await?;
                    ctx.variables = catch_ctx.variables;
                    ctx.node_outputs = catch_ctx.node_outputs;
                }
            }
        }

        Ok(NodeOutput::Continue)
    }

    fn validate_config(&self, config: &Value) -> AppResult<()> {
        let try_start = config
            .get("try_start")
            .and_then(|v| v.as_str())
            .unwrap_or("");
        if try_start.trim().is_empty() {
            return Err(AppError::Validation("try_start must not be empty".into()));
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_try_catch_requires_try_start() {
        let node = TryCatchNode::new();
        let result = node.validate_config(&serde_json::json!({"try_start": ""}));
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_try_catch_valid_config() {
        let node = TryCatchNode::new();
        let result = node.validate_config(&serde_json::json!({
            "try_start": "node_a",
            "catch_start": "node_b"
        }));
        assert!(result.is_ok());
    }
}
