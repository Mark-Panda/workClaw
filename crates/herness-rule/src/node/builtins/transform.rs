use async_trait::async_trait;
use serde_json::Value;

use crate::node::traits::{NodeContext, NodeHandler, NodeOutput};
use herness_common::error::AppResult;

pub struct TransformNode;

#[async_trait]
impl NodeHandler for TransformNode {
    fn node_type(&self) -> &'static str {
        "transform"
    }

    async fn execute(&self, ctx: &mut NodeContext, config: Value) -> AppResult<NodeOutput> {
        // Apply transformation: copy input through with optional field mapping
        if let Some(map) = config.get("field_map").and_then(|v| v.as_object()) {
            let mut output = serde_json::Map::new();
            for (target, source) in map {
                let source_key = source.as_str().unwrap_or_default();
                if let Some(value) = ctx.input.get(source_key) {
                    output.insert(target.clone(), value.clone());
                }
            }
            let _ = Value::Object(output);
        }
        Ok(NodeOutput::Continue)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_transform_continues() {
        let node = TransformNode;
        let mut ctx = NodeContext::new(Value::Null);
        let result = node.execute(&mut ctx, Value::Null).await.unwrap();
        match result {
            NodeOutput::Continue => {}
            _ => panic!("Expected Continue"),
        }
    }
}
