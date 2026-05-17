use async_trait::async_trait;
use serde_json::Value;

use crate::node::traits::{NodeContext, NodeHandler, NodeOutput};
use herness_common::error::AppResult;

/// CatchBlock node — executed when a TryCatch's try block fails.
/// Stores error information in the execution context.
pub struct CatchBlock;

#[async_trait]
impl NodeHandler for CatchBlock {
    fn node_type(&self) -> &'static str {
        "catch_block"
    }

    async fn execute(&self, ctx: &mut NodeContext, _config: Value) -> AppResult<NodeOutput> {
        // Extract error info set by TryCatchNode
        let error_msg = ctx
            .get_var("try_error")
            .and_then(|v| v.as_str().map(|s| s.to_string()))
            .unwrap_or_default();

        ctx.set_var("catch_error", Value::String(error_msg));
        ctx.set_var("catch_time", Value::String(chrono::Utc::now().to_rfc3339()));

        Ok(NodeOutput::Continue)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_catch_block_sets_vars() {
        let node = CatchBlock;
        let mut ctx = NodeContext::new(Value::Null);
        ctx.set_var("try_error", Value::String("test error".into()));

        let result = node.execute(&mut ctx, Value::Null).await.unwrap();
        assert!(matches!(result, NodeOutput::Continue));
        assert_eq!(
            ctx.get_var("catch_error"),
            Some(&Value::String("test error".into()))
        );
    }
}
