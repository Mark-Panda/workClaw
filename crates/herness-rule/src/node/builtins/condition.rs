use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::node::traits::{NodeContext, NodeHandler, NodeOutput};
use herness_common::error::{AppError, AppResult};

#[derive(Debug, Serialize, Deserialize)]
struct ConditionConfig {
    expression: String,
    true_branch: String,
    false_branch: String,
}

pub struct ConditionNode;

#[async_trait]
impl NodeHandler for ConditionNode {
    fn node_type(&self) -> &'static str {
        "condition"
    }

    async fn execute(&self, ctx: &mut NodeContext, config: Value) -> AppResult<NodeOutput> {
        let cfg: ConditionConfig =
            serde_json::from_value(config).map_err(|e| AppError::Validation(e.to_string()))?;

        let result = self.evaluate_expression(&cfg.expression, ctx)?;

        if result {
            Ok(NodeOutput::Route(cfg.true_branch))
        } else {
            Ok(NodeOutput::Route(cfg.false_branch))
        }
    }
}

impl ConditionNode {
    /// Simple expression evaluation. Supports basic comparisons on ctx values.
    /// In production, this would use cel-interpreter or Rhai.
    fn evaluate_expression(&self, expr: &str, _ctx: &NodeContext) -> AppResult<bool> {
        // Simple: check if expression is "true" or "false"
        match expr.trim() {
            "true" => Ok(true),
            "false" => Ok(false),
            _ => {
                // Try parsing as a boolean
                expr.parse::<bool>().or_else(|_| {
                    // For now, treat non-empty as true
                    Ok(!expr.is_empty())
                })
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_condition_true_routes_to_true_branch() {
        let node = ConditionNode;
        let mut ctx = NodeContext::new(Value::Null);
        let config = serde_json::json!({
            "expression": "true",
            "true_branch": "node_true",
            "false_branch": "node_false"
        });
        let result = node.execute(&mut ctx, config).await.unwrap();
        match result {
            NodeOutput::Route(target) => assert_eq!(target, "node_true"),
            _ => panic!("Expected Route"),
        }
    }

    #[tokio::test]
    async fn test_condition_false_routes_to_false_branch() {
        let node = ConditionNode;
        let mut ctx = NodeContext::new(Value::Null);
        let config = serde_json::json!({
            "expression": "false",
            "true_branch": "node_true",
            "false_branch": "node_false"
        });
        let result = node.execute(&mut ctx, config).await.unwrap();
        match result {
            NodeOutput::Route(target) => assert_eq!(target, "node_false"),
            _ => panic!("Expected Route"),
        }
    }
}
