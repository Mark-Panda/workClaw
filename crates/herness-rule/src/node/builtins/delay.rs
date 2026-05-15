use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::time::Duration;

use crate::node::traits::{NodeContext, NodeHandler, NodeOutput};
use herness_common::error::{AppError, AppResult};

#[derive(Debug, Serialize, Deserialize)]
struct DelayConfig {
    duration_ms: u64,
}

pub struct DelayNode;

#[async_trait]
impl NodeHandler for DelayNode {
    fn node_type(&self) -> &'static str {
        "delay"
    }

    async fn execute(&self, _ctx: &mut NodeContext, config: Value) -> AppResult<NodeOutput> {
        let cfg: DelayConfig =
            serde_json::from_value(config).map_err(|e| AppError::Validation(e.to_string()))?;
        tokio::time::sleep(Duration::from_millis(cfg.duration_ms)).await;
        Ok(NodeOutput::Continue)
    }

    fn validate_config(&self, config: &Value) -> AppResult<()> {
        let cfg: DelayConfig =
            serde_json::from_value(config.clone()).map_err(|e| AppError::Validation(e.to_string()))?;
        if cfg.duration_ms == 0 {
            return Err(AppError::Validation("duration_ms must be > 0".into()));
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_delay_executes() {
        let node = DelayNode;
        let mut ctx = NodeContext::new(Value::Null);
        let config = serde_json::json!({"duration_ms": 10});
        let result = node.execute(&mut ctx, config).await.unwrap();
        match result {
            NodeOutput::Continue => {}
            _ => panic!("Expected Continue"),
        }
    }

    #[test]
    fn test_validate_rejects_zero() {
        let node = DelayNode;
        let config = serde_json::json!({"duration_ms": 0});
        assert!(node.validate_config(&config).is_err());
    }
}
