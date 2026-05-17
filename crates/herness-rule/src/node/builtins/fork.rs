use async_trait::async_trait;
use futures::stream::FuturesUnordered;
use futures::StreamExt;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::sync::Arc;
use tokio::sync::Mutex;

use crate::node::registry::NodeRegistry;
use crate::node::traits::{NodeContext, NodeHandler, NodeOutput};
use herness_common::error::{AppError, AppResult};

#[derive(Debug, Serialize, Deserialize)]
struct ForkBranch {
    node_id: String,
    node_type: String,
    config: Value,
}

#[derive(Debug, Serialize, Deserialize)]
struct ForkConfig {
    branches: Vec<ForkBranch>,
    join_at: String,
}

pub struct ForkNode {
    node_registry: Mutex<Option<Arc<NodeRegistry>>>,
}

impl ForkNode {
    pub fn new() -> Self {
        Self {
            node_registry: Mutex::new(None),
        }
    }

    pub async fn set_node_registry(&self, registry: Arc<NodeRegistry>) {
        *self.node_registry.lock().await = Some(registry);
    }
}

impl Default for ForkNode {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait]
impl NodeHandler for ForkNode {
    fn node_type(&self) -> &'static str {
        "fork"
    }

    async fn execute(&self, ctx: &mut NodeContext, config: Value) -> AppResult<NodeOutput> {
        let cfg: ForkConfig =
            serde_json::from_value(config).map_err(|e| AppError::Validation(e.to_string()))?;

        if cfg.branches.is_empty() {
            return Err(AppError::Validation("fork requires at least one branch".into()));
        }

        let registry = self
            .node_registry
            .lock()
            .await
            .clone()
            .ok_or_else(|| AppError::RuleExecution("ForkNode: no node_registry configured".into()))?;

        let mut tasks = FuturesUnordered::new();

        for (idx, branch) in cfg.branches.iter().enumerate() {
            let mut branch_ctx = ctx.clone();
            let registry = registry.clone();
            let node_type = branch.node_type.clone();
            let node_config = branch.config.clone();
            let node_id = branch.node_id.clone();

            tasks.push(tokio::spawn(async move {
                let handler = registry.get(&node_type).ok_or_else(|| {
                    AppError::RuleExecution(format!("Unknown node type: {}", node_type))
                })?;

                match handler.execute(&mut branch_ctx, node_config).await {
                    Ok(_output) => Ok((idx, node_id, branch_ctx)),
                    Err(e) => Err(e),
                }
            }));
        }

        let mut branch_results: Vec<Value> = Vec::new();

        while let Some(task_result) = tasks.next().await {
            match task_result {
                Ok(Ok((idx, node_id, branch_ctx))) => {
                    // Merge branch variables with prefix
                    for (key, value) in &branch_ctx.variables {
                        let prefixed = format!("fork_branch_{}_{}", idx, key);
                        ctx.set_var(&prefixed, value.clone());
                        ctx.set_var(&key, value.clone());
                    }
                    ctx.set_var(
                        &format!("fork_branch_{}_output", idx),
                        branch_ctx.node_outputs.get(&node_id).cloned().unwrap_or(Value::Null),
                    );
                    branch_results.push(serde_json::to_value(&branch_ctx.variables).unwrap_or_default());
                }
                Ok(Err(e)) => {
                    return Err(AppError::RuleExecution(format!("Fork branch failed: {}", e)));
                }
                Err(e) => {
                    return Err(AppError::RuleExecution(format!("Fork task panicked: {}", e)));
                }
            }
        }

        let branch_count = branch_results.len();
        ctx.set_var("fork_results", Value::Array(branch_results));
        ctx.set_var("fork_branch_count", Value::Number(branch_count.into()));

        Ok(NodeOutput::Route(cfg.join_at))
    }

    fn validate_config(&self, config: &Value) -> AppResult<()> {
        let branches = config.get("branches").and_then(|v| v.as_array());
        match branches {
            Some(arr) if arr.is_empty() => {
                return Err(AppError::Validation("branches must not be empty".into()));
            }
            None => {
                return Err(AppError::Validation(
                    "fork requires 'branches' array in config".into(),
                ));
            }
            _ => {}
        }
        let join = config.get("join_at").and_then(|v| v.as_str()).unwrap_or("");
        if join.trim().is_empty() {
            return Err(AppError::Validation("join_at must not be empty".into()));
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::node::builtins::assign::AssignNode;
    use crate::node::builtins::end::EndNode;

    #[tokio::test]
    async fn test_fork_requires_branches() {
        let node = ForkNode::new();
        let result = node.validate_config(&serde_json::json!({"branches": [], "join_at": "join1"}));
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_fork_executes_branches() {
        let mut registry = NodeRegistry::new();
        registry.register(Arc::new(AssignNode));
        registry.register(Arc::new(EndNode));

        let node = ForkNode::new();
        node.set_node_registry(Arc::new(registry)).await;

        let mut ctx = NodeContext::new(serde_json::json!({"x": 1}));
        let config = serde_json::json!({
            "branches": [
                {"node_id": "b1", "node_type": "assign", "config": {"key": "val1", "value": "hello"}},
                {"node_id": "b2", "node_type": "assign", "config": {"key": "val2", "value": "world"}}
            ],
            "join_at": "join1"
        });

        let result = node.execute(&mut ctx, config).await.unwrap();
        match result {
            NodeOutput::Route(target) => {
                assert_eq!(target, "join1");
                // Both variables should be set
                assert_eq!(ctx.get_var("val1"), Some(&Value::String("hello".into())));
                assert_eq!(ctx.get_var("val2"), Some(&Value::String("world".into())));
            }
            _ => panic!("Expected Route"),
        }
    }
}
