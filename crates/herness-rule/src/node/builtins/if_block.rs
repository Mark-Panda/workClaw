use async_trait::async_trait;
use serde_json::Value;

use crate::node::traits::{NodeContext, NodeHandler, NodeOutput};
use herness_common::error::AppResult;

/// IfBlock node — a simple pass-through for a branch within an if/else container.
/// This is just a marker node; actual condition evaluation is handled by IfNode.
pub struct IfBlock;

#[async_trait]
impl NodeHandler for IfBlock {
    fn node_type(&self) -> &'static str {
        "if_block"
    }

    async fn execute(&self, _ctx: &mut NodeContext, _config: Value) -> AppResult<NodeOutput> {
        // Pass through — the IfNode parent handles routing
        Ok(NodeOutput::Continue)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_if_block_passthrough() {
        let node = IfBlock;
        let mut ctx = NodeContext::new(Value::Null);
        let result = node.execute(&mut ctx, Value::Null).await.unwrap();
        assert!(matches!(result, NodeOutput::Continue));
    }
}
