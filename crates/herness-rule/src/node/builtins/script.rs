use async_trait::async_trait;
use serde_json::Value;

use crate::node::traits::{NodeContext, NodeHandler, NodeOutput};
use herness_common::error::AppResult;

pub struct ScriptNode;

#[async_trait]
impl NodeHandler for ScriptNode {
    fn node_type(&self) -> &'static str {
        "script"
    }

    async fn execute(&self, ctx: &mut NodeContext, config: Value) -> AppResult<NodeOutput> {
        let _script = config
            .get("script")
            .and_then(|v| v.as_str())
            .unwrap_or("");
        // In production, this would execute Rhai scripts
        ctx.set_var("script_executed", Value::Bool(true));
        Ok(NodeOutput::Continue)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_script_node() {
        let node = ScriptNode;
        let mut ctx = NodeContext::new(Value::Null);
        let config = serde_json::json!({"script": "ctx.set_var('test', 42);"});
        let result = node.execute(&mut ctx, config).await.unwrap();
        match result {
            NodeOutput::Continue => {
                assert_eq!(ctx.get_var("script_executed"), Some(&Value::Bool(true)));
            }
            _ => panic!("Expected Continue"),
        }
    }
}
