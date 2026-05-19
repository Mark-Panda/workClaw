use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::sync::Arc;
use tokio::sync::Mutex;

use crate::engine::RuleEngine;
use crate::node::traits::{NodeContext, NodeHandler, NodeOutput};
use herness_common::error::{AppError, AppResult};

#[derive(Debug, Serialize, Deserialize)]
struct LoopConfig {
    iterator_source: String,
    loop_var: String,
    max_iterations: Option<usize>,
    /// Node ID of the first body child (set by frontend converter).
    /// When present, the loop executes the body chain for each iteration.
    body_start_id: Option<String>,
    /// Node ID to Route to after all iterations complete.
    /// Must point past the body chain to avoid re-executing body nodes.
    flow_out_id: Option<String>,
}

pub struct LoopNode {
    engine: Mutex<Option<Arc<RuleEngine>>>,
}

impl LoopNode {
    pub fn new() -> Self {
        Self {
            engine: Mutex::new(None),
        }
    }

    pub async fn set_engine(&self, engine: Arc<RuleEngine>) {
        *self.engine.lock().await = Some(engine);
    }
}

impl Default for LoopNode {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait]
impl NodeHandler for LoopNode {
    fn node_type(&self) -> &'static str {
        "loop"
    }

    async fn execute(&self, ctx: &mut NodeContext, config: Value) -> AppResult<NodeOutput> {
        let cfg: LoopConfig =
            serde_json::from_value(config).map_err(|e| AppError::Validation(e.to_string()))?;

        let max_iter = cfg.max_iterations.unwrap_or(1000);
        let array = ctx
            .get_var(&cfg.iterator_source)
            .cloned()
            .unwrap_or(Value::Null);

        let items: Vec<Value> = match &array {
            Value::Array(arr) => arr.clone(),
            _ => {
                return Err(AppError::RuleExecution(format!(
                    "Loop iterator '{}' is not an array",
                    cfg.iterator_source
                )));
            }
        };

        let _engine_guard = self.engine.lock().await;
        let engine = match _engine_guard.as_ref() {
            Some(e) => e.clone(),
            None => {
                return Err(AppError::RuleExecution(
                    "LoopNode: no engine reference configured".into(),
                ));
            }
        };

        // Clone chain_id to avoid holding an immutable borrow on ctx
        let chain_id = ctx.chain_id.clone();
        let _chain = engine.get_chain(&chain_id);

        // Determine body start node
        let body_start = if let Some(ref start_id) = cfg.body_start_id {
            Some(start_id.clone())
        } else {
            _chain
                .as_ref()
                .and_then(|c| c.next_node(&ctx.current_node_id))
                .map(|n| n.id.clone())
        };

        let mut results: Vec<Value> = Vec::new();

        if let Some(body_start_id) = body_start {
            // With body execution: iterate and execute body chain for each item
            for (idx, item) in items.iter().take(max_iter).enumerate() {
                ctx.set_var(&cfg.loop_var, item.clone());
                ctx.set_var("loop_index", Value::Number(idx.into()));

                // Execute body chain segment, which stops before end
                let body_ctx = engine
                    .execute_chain_segment(&chain_id, &body_start_id, "", ctx.clone())
                    .await?;

                // Sync context back (variables from body execution persist across iterations)
                ctx.variables = body_ctx.variables;
                ctx.node_outputs = body_ctx.node_outputs;

                results.push(item.clone());
            }
        } else {
            // Legacy mode: just set variables, body executed by engine flow
            for (idx, item) in items.iter().take(max_iter).enumerate() {
                ctx.set_var(&cfg.loop_var, item.clone());
                ctx.set_var("loop_index", Value::Number(idx.into()));
            }
        }

        ctx.set_var("loop_results", Value::Array(results));
        ctx.set_var("loop_count", Value::Number(items.len().into()));

        // Route past the body chain to avoid re-executing body nodes
        if let Some(ref flow_out) = cfg.flow_out_id {
            Ok(NodeOutput::Route(flow_out.clone()))
        } else {
            Ok(NodeOutput::Continue)
        }
    }

    fn validate_config(&self, config: &Value) -> AppResult<()> {
        let source = config
            .get("iterator_source")
            .and_then(|v| v.as_str())
            .unwrap_or("");
        if source.trim().is_empty() {
            return Err(AppError::Validation("iterator_source must not be empty".into()));
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
    use crate::engine::RuleEngine;
    use crate::interceptor::InterceptorRegistry;

    #[tokio::test]
    async fn test_loop_requires_iterator_source() {
        let node = LoopNode::new();
        let result = node.validate_config(&serde_json::json!({"iterator_source": ""}));
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_loop_sets_variables() {
        let mut node_registry = NodeRegistry::new();
        node_registry.register(Arc::new(StartNode));
        node_registry.register(Arc::new(EndNode));

        let interceptor_registry = InterceptorRegistry::new();
        let engine = Arc::new(RuleEngine::new(
            Arc::new(node_registry),
            Arc::new(interceptor_registry),
            crate::engine::EngineConfig::default(),
        ));

        let chain = crate::dsl::types::RuleChain {
            chain_id: "test-loop-vars".into(),
            version: "1.0".into(),
            nodes: vec![
                crate::dsl::types::RuleNode {
                    id: "loop".into(),
                    node_type: "loop".into(),
                    config: Default::default(),
                },
                crate::dsl::types::RuleNode {
                    id: "end".into(),
                    node_type: "end".into(),
                    config: Default::default(),
                },
            ],
            edges: vec![crate::dsl::types::RuleEdge {
                from: "loop".into(),
                to: "end".into(),
                label: None,
            }],
            interceptor_configs: vec![],
        };
        engine.cache_chain(chain);

        let node = LoopNode::new();
        node.set_engine(engine).await;

        let mut ctx = NodeContext::new(Value::Null);
        ctx.chain_id = "test-loop-vars".into();
        ctx.current_node_id = "loop".into();
        ctx.set_var("items", serde_json::json!(["a", "b", "c"]));

        let config = serde_json::json!({
            "iterator_source": "items",
            "loop_var": "item",
            "max_iterations": 10
        });

        let result = node.execute(&mut ctx, config).await.unwrap();
        match result {
            NodeOutput::Continue => {
                assert_eq!(ctx.get_var("loop_count"), Some(&Value::Number(3.into())));
            }
            _ => panic!("Expected Continue"),
        }
    }

    #[tokio::test]
    async fn test_loop_with_engine_and_body() {
        // Build a minimal engine with the loop node registered
        let mut node_registry = NodeRegistry::new();
        node_registry.register(Arc::new(StartNode));
        node_registry.register(Arc::new(EndNode));

        let interceptor_registry = InterceptorRegistry::new();
        let engine = Arc::new(RuleEngine::new(
            Arc::new(node_registry),
            Arc::new(interceptor_registry),
            crate::engine::EngineConfig::default(),
        ));

        let chain = crate::dsl::types::RuleChain {
            chain_id: "test-loop".into(),
            version: "1.0".into(),
            nodes: vec![
                crate::dsl::types::RuleNode {
                    id: "loop".into(),
                    node_type: "loop".into(),
                    config: Default::default(),
                },
                crate::dsl::types::RuleNode {
                    id: "end".into(),
                    node_type: "end".into(),
                    config: Default::default(),
                },
            ],
            edges: vec![crate::dsl::types::RuleEdge {
                from: "loop".into(),
                to: "end".into(),
                label: None,
            }],
            interceptor_configs: vec![],
        };
        engine.cache_chain(chain);

        let node = LoopNode::new();
        node.set_engine(engine).await;

        let mut ctx = NodeContext::new(Value::Null);
        ctx.chain_id = "test-loop".into();
        ctx.current_node_id = "loop".into();
        ctx.set_var("items", serde_json::json!(["x", "y"]));

        let config = serde_json::json!({
            "iterator_source": "items",
            "loop_var": "item",
            "body_start_id": "end"
        });

        // Pass end as body_start_id (simplistic test — just verifies execution doesn't crash)
        let result = node.execute(&mut ctx, config).await.unwrap();
        assert!(matches!(result, NodeOutput::Continue));
        assert_eq!(ctx.get_var("loop_count"), Some(&Value::Number(2.into())));
    }

    #[tokio::test]
    async fn test_loop_non_array_errors() {
        let node = LoopNode::new();
        let mut ctx = NodeContext::new(Value::Null);
        ctx.set_var("items", Value::String("not_an_array".into()));

        let config = serde_json::json!({
            "iterator_source": "items",
            "loop_var": "item"
        });

        let result = node.execute(&mut ctx, config).await;
        assert!(result.is_err());
    }
}
