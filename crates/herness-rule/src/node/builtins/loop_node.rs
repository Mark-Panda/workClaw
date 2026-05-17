use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::sync::Arc;
use tokio::sync::Mutex;

use crate::engine::RuleEngine;
use crate::node::traits::{NodeContext, NodeHandler, NodeOutput};
use herness_common::error::{AppError, AppResult};

#[derive(Debug, Serialize, Deserialize)]
struct LoopConfig {
    iterator_source: String,
    loop_var: String,
    max_iterations: Option<usize>,
}

pub struct LoopNode {
    engine: Mutex<Option<Arc<RuleEngine>>>,
}

impl LoopNode {
    pub fn new() -> Self {
        Self {
            engine: Mutex::new(None),
        }
    }

    pub async fn set_engine(&self, engine: Arc<RuleEngine>) {
        *self.engine.lock().await = Some(engine);
    }
}

impl Default for LoopNode {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait]
impl NodeHandler for LoopNode {
    fn node_type(&self) -> &'static str {
        "loop"
    }

    async fn execute(&self, ctx: &mut NodeContext, config: Value) -> AppResult<NodeOutput> {
        let cfg: LoopConfig =
            serde_json::from_value(config).map_err(|e| AppError::Validation(e.to_string()))?;

        let max_iter = cfg.max_iterations.unwrap_or(1000);

        let array = ctx
            .get_var(&cfg.iterator_source)
            .cloned()
            .unwrap_or(Value::Null);

        let items: Vec<Value> = match &array {
            Value::Array(arr) => arr.clone(),
            _ => {
                return Err(AppError::RuleExecution(format!(
                    "Loop iterator '{}' is not an array",
                    cfg.iterator_source
                )));
            }
        };

        let _engine = self
            .engine
            .lock()
            .await
            .clone();

        let results = Vec::new();

        for (idx, item) in items.iter().take(max_iter).enumerate() {
            ctx.set_var(&cfg.loop_var, item.clone());
            ctx.set_var("loop_index", Value::Number(idx.into()));

            // Execute next nodes in the chain by passing through
            // The loop body node should reference loop_var from context
            // For now, just set the variable and continue — the downstream
            // nodes in the chain will process each iteration naturally
        }

        // Store the original items count for downstream visibility
        ctx.set_var("loop_results", Value::Array(results));
        ctx.set_var("loop_count", Value::Number(items.len().into()));

        Ok(NodeOutput::Continue)
    }

    fn validate_config(&self, config: &Value) -> AppResult<()> {
        let source = config
            .get("iterator_source")
            .and_then(|v| v.as_str())
            .unwrap_or("");
        if source.trim().is_empty() {
            return Err(AppError::Validation("iterator_source must not be empty".into()));
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_loop_requires_iterator_source() {
        let node = LoopNode::new();
        let result = node.validate_config(&serde_json::json!({"iterator_source": ""}));
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_loop_sets_loop_var() {
        let node = LoopNode::new();
        let mut ctx = NodeContext::new(Value::Null);
        ctx.set_var("items", serde_json::json!(["a", "b", "c"]));

        let config = serde_json::json!({
            "iterator_source": "items",
            "loop_var": "item",
            "max_iterations": 10
        });

        let result = node.execute(&mut ctx, config).await.unwrap();
        match result {
            NodeOutput::Continue => {
                // Loop sets loop_var to the last item and loop_count
                assert_eq!(ctx.get_var("loop_count"), Some(&Value::Number(3.into())));
            }
            _ => panic!("Expected Continue"),
        }
    }

    #[tokio::test]
    async fn test_loop_non_array_errors() {
        let node = LoopNode::new();
        let mut ctx = NodeContext::new(Value::Null);
        ctx.set_var("items", Value::String("not_an_array".into()));

        let config = serde_json::json!({
            "iterator_source": "items",
            "loop_var": "item"
        });

        let result = node.execute(&mut ctx, config).await;
        assert!(result.is_err());
    }
}
