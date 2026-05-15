use async_trait::async_trait;
use serde_json::Value;
use tracing::info;

use crate::node::traits::{NodeContext, NodeHandler, NodeOutput};
use herness_common::error::AppResult;

pub struct LogNode;

#[async_trait]
impl NodeHandler for LogNode {
    fn node_type(&self) -> &'static str {
        "log"
    }

    async fn execute(&self, ctx: &mut NodeContext, config: Value) -> AppResult<NodeOutput> {
        let message = config
            .get("message")
            .and_then(|v| v.as_str())
            .unwrap_or("Rule log entry");
        info!("[rule:log] {}", message);
        ctx.set_var("last_log_message", Value::String(message.to_string()));
        Ok(NodeOutput::Continue)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_log_node_sets_variable() {
        let node = LogNode;
        let mut ctx = NodeContext::new(Value::Null);
        let config = serde_json::json!({"message": "test log"});
        let result = node.execute(&mut ctx, config).await.unwrap();
        match result {
            NodeOutput::Continue => {
                assert_eq!(
                    ctx.get_var("last_log_message"),
                    Some(&Value::String("test log".into()))
                );
            }
            _ => panic!("Expected Continue"),
        }
    }
}
