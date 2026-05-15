use async_trait::async_trait;
use serde_json::Value;

use crate::node::traits::{NodeContext, NodeHandler, NodeOutput};
use herness_common::error::AppResult;

pub struct StartNode;

#[async_trait]
impl NodeHandler for StartNode {
    fn node_type(&self) -> &'static str {
        "start"
    }

    async fn execute(&self, _ctx: &mut NodeContext, _config: Value) -> AppResult<NodeOutput> {
        Ok(NodeOutput::Continue)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_start_node() {
        let node = StartNode;
        let mut ctx = NodeContext::new(Value::Null);
        let result = node.execute(&mut ctx, Value::Null).await.unwrap();
        match result {
            NodeOutput::Continue => {}
            _ => panic!("Expected Continue"),
        }
    }
}
