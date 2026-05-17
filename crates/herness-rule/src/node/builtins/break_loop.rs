use async_trait::async_trait;
use serde_json::Value;

use crate::node::traits::{NodeContext, NodeHandler, NodeOutput};
use herness_common::error::AppResult;

/// BreakLoop node — signals the engine to stop processing the current chain segment.
/// Used inside loop bodies to break out of iteration early.
pub struct BreakLoopNode;

#[async_trait]
impl NodeHandler for BreakLoopNode {
    fn node_type(&self) -> &'static str {
        "break_loop"
    }

    async fn execute(&self, _ctx: &mut NodeContext, _config: Value) -> AppResult<NodeOutput> {
        // Return Stop to break out of the current execution chain (loop body)
        Ok(NodeOutput::Stop)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_break_loop_stops() {
        let node = BreakLoopNode;
        let mut ctx = NodeContext::new(Value::Null);
        let result = node.execute(&mut ctx, Value::Null).await.unwrap();
        assert!(matches!(result, NodeOutput::Stop));
    }
}
