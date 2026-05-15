use async_trait::async_trait;
use serde_json::Value;

use crate::node::traits::{NodeContext, NodeHandler, NodeOutput};
use herness_common::error::AppResult;

pub struct EndNode;

#[async_trait]
impl NodeHandler for EndNode {
    fn node_type(&self) -> &'static str {
        "end"
    }

    async fn execute(&self, _ctx: &mut NodeContext, _config: Value) -> AppResult<NodeOutput> {
        Ok(NodeOutput::Stop)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_end_node_stops() {
        let node = EndNode;
        let mut ctx = NodeContext::new(Value::Null);
        let result = node.execute(&mut ctx, Value::Null).await.unwrap();
        match result {
            NodeOutput::Stop => {}
            _ => panic!("Expected Stop"),
        }
    }
}
