use async_trait::async_trait;
use futures::stream::FuturesUnordered;
use futures::StreamExt;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::sync::Arc;
use tokio::sync::Mutex;

use crate::engine::RuleEngine;
use crate::node::traits::{NodeContext, NodeHandler, NodeOutput};
use herness_common::error::{AppError, AppResult};

/// Maximum concurrent branch tasks to prevent resource exhaustion.
const MAX_CONCURRENT_BRANCHES: usize = 10;

/// A single branch defined by segment start/end node IDs.
#[derive(Debug, Serialize, Deserialize, Clone)]
struct BranchSegment {
    /// First node in the branch chain
    start_id: String,
    /// Last node in the branch chain (exclusive – segment stops before end_id)
    end_id: String,
}

#[derive(Debug, Serialize, Deserialize)]
struct ForkConfig {
    /// Branch definitions (multi-node segments). Used by modern frontend.
    #[serde(default)]
    segments: Vec<BranchSegment>,
    /// Legacy single-node branches. Kept for backward compatibility.
    #[serde(default)]
    branches: Vec<LegacyBranch>,
    /// Route to this node after all branches complete
    join_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
struct LegacyBranch {
    node_id: String,
    node_type: String,
    #[serde(default)]
    config: Value,
}

pub struct ForkNode {
    engine: Mutex<Option<Arc<RuleEngine>>>,
}

impl ForkNode {
    pub fn new() -> Self {
        Self {
            engine: Mutex::new(None),
        }
    }

    pub async fn set_engine(&self, engine: Arc<RuleEngine>) {
        *self.engine.lock().await = Some(engine);
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

        let engine = self
            .engine
            .lock()
            .await
            .clone()
            .ok_or_else(|| AppError::RuleExecution("ForkNode: no engine configured".into()))?;

        let chain_id = ctx.chain_id.clone();
        let mut branch_results: Vec<Value> = Vec::new();

        // ── Multi-node branch segments ──────────────────────────
        if !cfg.segments.is_empty() {
            if cfg.segments.len() > MAX_CONCURRENT_BRANCHES {
                return Err(AppError::Validation(format!(
                    "fork: too many branches ({}), maximum is {}",
                    cfg.segments.len(),
                    MAX_CONCURRENT_BRANCHES
                )));
            }

            let mut tasks = FuturesUnordered::new();

            for (idx, seg) in cfg.segments.iter().enumerate() {
                let engine = engine.clone();
                let chain_id = chain_id.clone();
                let ctx_clone = ctx.clone();
                let start_id = seg.start_id.clone();
                let end_id = seg.end_id.clone();

                tasks.push(tokio::spawn(async move {
                    let result = engine
                        .execute_chain_segment(&chain_id, &start_id, &end_id, ctx_clone)
                        .await;
                    (idx, result)
                }));
            }

            // ── Collect segment results ─────────────────────────
            while let Some(task_result) = tasks.next().await {
                match task_result {
                    Ok((idx, Ok(ret_ctx))) => {
                        // Only write prefixed variables to avoid branch-to-branch overwrites.
                        // Each branch's variables are namespaced as fork_branch_{idx}_{key}.
                        for (key, value) in &ret_ctx.variables {
                            ctx.set_var(&format!("fork_branch_{}_{}", idx, key), value.clone());
                        }
                        branch_results
                            .push(serde_json::to_value(&ret_ctx.variables).unwrap_or_default());
                    }
                    Ok((_, Err(e))) => {
                        return Err(AppError::RuleExecution(format!(
                            "Fork branch failed: {}",
                            e
                        )));
                    }
                    Err(e) => {
                        return Err(AppError::RuleExecution(format!(
                            "Fork task panicked: {}",
                            e
                        )));
                    }
                }
            }
        }
        // ── Legacy single-node branches ─────────────────────────
        else if !cfg.branches.is_empty() {
            if cfg.branches.len() > MAX_CONCURRENT_BRANCHES {
                return Err(AppError::Validation(format!(
                    "fork: too many branches ({}), maximum is {}",
                    cfg.branches.len(),
                    MAX_CONCURRENT_BRANCHES
                )));
            }

            let registry = engine.node_registry();
            let mut tasks = FuturesUnordered::new();

            for (idx, branch) in cfg.branches.iter().enumerate() {
                let registry = registry.clone();
                let mut branch_ctx = ctx.clone();
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

            // ── Collect legacy results ──────────────────────────
            while let Some(task_result) = tasks.next().await {
                match task_result {
                    Ok(Ok((idx, node_id, branch_ctx))) => {
                        // Only write prefixed variables
                        for (key, value) in &branch_ctx.variables {
                            ctx.set_var(&format!("fork_branch_{}_{}", idx, key), value.clone());
                        }
                        ctx.set_var(
                            &format!("fork_branch_{}_output", idx),
                            branch_ctx
                                .node_outputs
                                .get(&node_id)
                                .cloned()
                                .unwrap_or(Value::Null),
                        );
                        branch_results.push(
                            serde_json::to_value(&branch_ctx.variables).unwrap_or_default(),
                        );
                    }
                    Ok(Err(e)) => {
                        return Err(AppError::RuleExecution(format!(
                            "Fork branch failed: {}",
                            e
                        )));
                    }
                    Err(e) => {
                        return Err(AppError::RuleExecution(format!(
                            "Fork task panicked: {}",
                            e
                        )));
                    }
                }
            }
        } else {
            return Err(AppError::Validation(
                "fork requires at least one branch segment or branch".into(),
            ));
        }

        let branch_count = branch_results.len();
        ctx.set_var("fork_results", Value::Array(branch_results));
        ctx.set_var("fork_branch_count", Value::Number(branch_count.into()));

        Ok(NodeOutput::Route(cfg.join_at))
    }

    fn validate_config(&self, config: &Value) -> AppResult<()> {
        let segments = config.get("segments").and_then(|v| v.as_array());
        let branches = config.get("branches").and_then(|v| v.as_array());

        match (segments, branches) {
            (Some(arr), _) if arr.is_empty() => {
                return Err(AppError::Validation("segments must not be empty".into()));
            }
            (None, Some(arr)) if arr.is_empty() => {
                return Err(AppError::Validation("branches must not be empty".into()));
            }
            (None, None) | (None, Some(_)) => {}
            (Some(_), _) => {}
        }

        // Both empty or both missing
        let has_segments = segments.map(|a| !a.is_empty()).unwrap_or(false);
        let has_branches = branches.map(|a| !a.is_empty()).unwrap_or(false);
        if !has_segments && !has_branches {
            return Err(AppError::Validation(
                "fork requires 'segments' or 'branches' in config".into(),
            ));
        }

        // Validate max branches
        let branch_count = segments.map(|a| a.len()).unwrap_or(0);
        let legacy_count = branches.map(|a| a.len()).unwrap_or(0);
        let total = branch_count.max(legacy_count);
        if total > MAX_CONCURRENT_BRANCHES {
            return Err(AppError::Validation(format!(
                "fork: too many branches ({}), maximum is {}",
                total, MAX_CONCURRENT_BRANCHES
            )));
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
    use crate::node::builtins::end::EndNode;
    use crate::node::builtins::start::StartNode;
    use crate::node::registry::NodeRegistry;
    use crate::interceptor::InterceptorRegistry;

    #[tokio::test]
    async fn test_fork_requires_branches() {
        let node = ForkNode::new();
        let result = node.validate_config(&serde_json::json!({"segments": [], "join_at": "join1"}));
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_fork_rejects_too_many_branches() {
        let node = ForkNode::new();
        let segments: Vec<Value> = (0..11)
            .map(|i| serde_json::json!({"start_id": format!("s{}", i), "end_id": format!("e{}", i)}))
            .collect();
        let result = node.validate_config(&serde_json::json!({"segments": segments, "join_at": "join1"}));
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_fork_legacy_branches() {
        let mut node_registry = NodeRegistry::new();
        node_registry.register(Arc::new(StartNode));
        node_registry.register(Arc::new(EndNode));
        let interceptor_registry = InterceptorRegistry::new();
        let engine = Arc::new(RuleEngine::new(
            Arc::new(node_registry),
            Arc::new(interceptor_registry),
            crate::engine::EngineConfig::default(),
        ));

        let node = ForkNode::new();
        node.set_engine(engine).await;

        let mut ctx = NodeContext::new(serde_json::json!({"x": 1}));
        let config = serde_json::json!({
            "branches": [
                {"node_id": "b1", "node_type": "start", "config": {}},
                {"node_id": "b2", "node_type": "start", "config": {}}
            ],
            "join_at": "join1"
        });

        let result = node.execute(&mut ctx, config).await.unwrap();
        match result {
            NodeOutput::Route(target) => {
                assert_eq!(target, "join1");
            }
            _ => panic!("Expected Route"),
        }
    }
}
