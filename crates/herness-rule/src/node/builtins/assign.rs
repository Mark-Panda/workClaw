use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::node::traits::{NodeContext, NodeHandler, NodeOutput};
use herness_common::error::AppResult;

#[derive(Debug, Serialize, Deserialize)]
struct AssignConfig {
    key: String,
    value: Value,
}

pub struct AssignNode;

#[async_trait]
impl NodeHandler for AssignNode {
    fn node_type(&self) -> &'static str {
        "assign"
    }

    async fn execute(&self, ctx: &mut NodeContext, config: Value) -> AppResult<NodeOutput> {
        let cfg: AssignConfig = serde_json::from_value(config).unwrap_or_else(|_| AssignConfig {
            key: "default".into(),
            value: Value::Null,
        });
        ctx.set_var(&cfg.key, cfg.value);
        Ok(NodeOutput::Continue)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_assign_sets_variable() {
        let node = AssignNode;
        let mut ctx = NodeContext::new(Value::Null);
        let config = serde_json::json!({"key": "my_var", "value": 42});
        let result = node.execute(&mut ctx, config).await.unwrap();
        match result {
            NodeOutput::Continue => {
                assert_eq!(ctx.get_var("my_var"), Some(&Value::from(42)));
            }
            _ => panic!("Expected Continue"),
        }
    }
}
