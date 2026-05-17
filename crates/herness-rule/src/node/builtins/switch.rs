use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::sync::Arc;
use tokio::sync::Mutex;

use crate::engine::RuleEngine;
use crate::node::traits::{NodeContext, NodeHandler, NodeOutput};
use herness_common::error::{AppError, AppResult};

/// A single branch segment
#[derive(Debug, Serialize, Deserialize, Clone)]
struct BranchSegment {
    start_id: String,
    end_id: String,
}

#[derive(Debug, Serialize, Deserialize)]
struct SwitchConfig {
    #[serde(default)]
    segments: Vec<BranchSegment>,
    join_at: String,
}

pub struct SwitchNode {
    engine: Mutex<Option<Arc<RuleEngine>>>,
}

impl SwitchNode {
    pub fn new() -> Self {
        Self {
            engine: Mutex::new(None),
        }
    }

    pub async fn set_engine(&self, engine: Arc<RuleEngine>) {
        *self.engine.lock().await = Some(engine);
    }
}

impl Default for SwitchNode {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait]
impl NodeHandler for SwitchNode {
    fn node_type(&self) -> &'static str {
        "switch"
    }

    async fn execute(&self, ctx: &mut NodeContext, config: Value) -> AppResult<NodeOutput> {
        let cfg: SwitchConfig =
            serde_json::from_value(config).map_err(|e| AppError::Validation(e.to_string()))?;

        let engine = self
            .engine
            .lock()
            .await
            .clone()
            .ok_or_else(|| AppError::RuleExecution("SwitchNode: no engine configured".into()))?;

        let chain_id = ctx.chain_id.clone();

        // Execute all branch segments sequentially (first match wins)
        let mut final_ctx = None;
        for seg in &cfg.segments {
            let branch_ctx = engine
                .execute_chain_segment(&chain_id, &seg.start_id, &seg.end_id, ctx.clone())
                .await?;

            // Check if this branch had a condition match (stored by CaseNode)
            let matched = branch_ctx
                .get_var("__case_matched")
                .and_then(|v| v.as_bool())
                .unwrap_or(true);

            if matched {
                final_ctx = Some(branch_ctx);
                break;
            }
        }

        if let Some(found_ctx) = final_ctx {
            ctx.variables = found_ctx.variables;
            ctx.node_outputs = found_ctx.node_outputs;
        }

        Ok(NodeOutput::Route(cfg.join_at))
    }

    fn validate_config(&self, config: &Value) -> AppResult<()> {
        let join = config.get("join_at").and_then(|v| v.as_str()).unwrap_or("");
        if join.trim().is_empty() {
            return Err(AppError::Validation("join_at must not be empty".into()));
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_switch_requires_join_at() {
        let node = SwitchNode::new();
        let result = node.validate_config(&serde_json::json!({"join_at": ""}));
        assert!(result.is_err());
    }
}
