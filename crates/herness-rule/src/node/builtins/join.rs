use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::node::traits::{NodeContext, NodeHandler, NodeOutput};
use herness_common::error::AppResult;

#[derive(Debug, Serialize, Deserialize)]
struct JoinConfig {
    merge_strategy: Option<String>,
}

pub struct JoinNode;

#[async_trait]
impl NodeHandler for JoinNode {
    fn node_type(&self) -> &'static str {
        "join"
    }

    async fn execute(&self, ctx: &mut NodeContext, config: Value) -> AppResult<NodeOutput> {
        let cfg: JoinConfig = serde_json::from_value(config).unwrap_or(JoinConfig {
            merge_strategy: None,
        });

        let strategy = cfg.merge_strategy.as_deref().unwrap_or("merge");

        match strategy {
            "array" => {
                let mut results = Vec::new();
                if let Some(count_val) = ctx.get_var("fork_branch_count") {
                    let count = count_val.as_u64().unwrap_or(0) as usize;
                    for i in 0..count {
                        let key = format!("fork_branch_{}_output", i);
                        if let Some(val) = ctx.get_var(&key) {
                            results.push(val.clone());
                        }
                    }
                }
                ctx.set_var("join_result", Value::Array(results));
            }
            "first" => {
                if let Some(val) = ctx.get_var("fork_branch_0_output") {
                    ctx.set_var("join_result", val.clone());
                }
            }
            _ => {
                // "merge" (default): all branch variables are already merged by ForkNode,
                // collect them into a single object
                let mut merged = serde_json::Map::new();
                if let Some(count_val) = ctx.get_var("fork_branch_count") {
                    let count = count_val.as_u64().unwrap_or(0) as usize;
                    for i in 0..count {
                        let key = format!("fork_branch_{}_output", i);
                        if let Some(val) = ctx.get_var(&key) {
                            merged.insert(format!("branch_{}", i), val.clone());
                        }
                    }
                }
                // Also include fork_results if available
                if let Some(results) = ctx.get_var("fork_results") {
                    merged.insert("all_branches".to_string(), results.clone());
                }
                ctx.set_var("join_result", Value::Object(merged));
            }
        }

        Ok(NodeOutput::Continue)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_join_merge_default() {
        let node = JoinNode;
        let mut ctx = NodeContext::new(Value::Null);
        ctx.set_var("fork_branch_count", Value::Number(2.into()));
        ctx.set_var("fork_branch_0_output", Value::String("result_a".into()));
        ctx.set_var("fork_branch_1_output", Value::String("result_b".into()));

        let result = node.execute(&mut ctx, Value::Null).await.unwrap();
        match result {
            NodeOutput::Continue => {
                let join = ctx.get_var("join_result").unwrap();
                assert!(join.is_object());
                let obj = join.as_object().unwrap();
                assert_eq!(obj.get("branch_0"), Some(&Value::String("result_a".into())));
                assert_eq!(obj.get("branch_1"), Some(&Value::String("result_b".into())));
            }
            _ => panic!("Expected Continue"),
        }
    }

    #[tokio::test]
    async fn test_join_array_strategy() {
        let node = JoinNode;
        let mut ctx = NodeContext::new(Value::Null);
        ctx.set_var("fork_branch_count", Value::Number(2.into()));
        ctx.set_var("fork_branch_0_output", Value::String("a".into()));
        ctx.set_var("fork_branch_1_output", Value::String("b".into()));

        let config = serde_json::json!({"merge_strategy": "array"});
        let result = node.execute(&mut ctx, config).await.unwrap();
        match result {
            NodeOutput::Continue => {
                let join = ctx.get_var("join_result").unwrap();
                assert!(join.is_array());
                let arr = join.as_array().unwrap();
                assert_eq!(arr.len(), 2);
            }
            _ => panic!("Expected Continue"),
        }
    }

    #[tokio::test]
    async fn test_join_first_strategy() {
        let node = JoinNode;
        let mut ctx = NodeContext::new(Value::Null);
        ctx.set_var("fork_branch_count", Value::Number(2.into()));
        ctx.set_var("fork_branch_0_output", Value::String("first".into()));
        ctx.set_var("fork_branch_1_output", Value::String("second".into()));

        let config = serde_json::json!({"merge_strategy": "first"});
        let result = node.execute(&mut ctx, config).await.unwrap();
        match result {
            NodeOutput::Continue => {
                assert_eq!(
                    ctx.get_var("join_result"),
                    Some(&Value::String("first".into()))
                );
            }
            _ => panic!("Expected Continue"),
        }
    }
}
