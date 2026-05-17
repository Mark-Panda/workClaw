pub mod context;
pub mod state;

use crate::engine::context::ExecutionContext;
use crate::dsl::types::RuleChain;
use crate::interceptor::InterceptorRegistry;
use crate::node::registry::NodeRegistry;
use crate::node::traits::NodeOutput;
use dashmap::DashMap;
use herness_common::error::{AppError, AppResult};
use serde_json::Value;
use std::sync::Arc;

pub struct RuleEngine {
    node_registry: Arc<NodeRegistry>,
    interceptor_registry: Arc<InterceptorRegistry>,
    chain_cache: Arc<DashMap<String, Arc<RuleChain>>>,
}

impl RuleEngine {
    pub fn new(
        node_registry: Arc<NodeRegistry>,
        interceptor_registry: Arc<InterceptorRegistry>,
    ) -> Self {
        Self {
            node_registry,
            interceptor_registry,
            chain_cache: Arc::new(DashMap::new()),
        }
    }

    pub fn cache_chain(&self, chain: RuleChain) {
        self.chain_cache
            .insert(chain.chain_id.clone(), Arc::new(chain));
    }

    pub fn get_chain(&self, chain_id: &str) -> Option<Arc<RuleChain>> {
        self.chain_cache.get(chain_id).map(|r| r.value().clone())
    }

    pub fn uncache_chain(&self, chain_id: &str) {
        self.chain_cache.remove(chain_id);
    }

    pub fn node_registry(&self) -> &Arc<NodeRegistry> {
        &self.node_registry
    }

    pub fn interceptor_registry(&self) -> &Arc<InterceptorRegistry> {
        &self.interceptor_registry
    }

    pub async fn execute(
        &self,
        chain_id: &str,
        input: Value,
    ) -> AppResult<Value> {
        let chain = self
            .get_chain(chain_id)
            .ok_or_else(|| AppError::NotFound(format!("Rule chain not found: {}", chain_id)))?;

        let mut ctx = ExecutionContext::new(input);
        let interceptors = self
            .interceptor_registry
            .get_enabled_interceptors(&chain.interceptor_configs);

        let mut current = chain.head_node().ok_or_else(|| {
            AppError::Validation("Rule chain has no start node".into())
        })?;

        loop {
            // Run before-interceptors
            for (interceptor, config) in &interceptors {
                interceptor
                    .before(&mut ctx, &current.id, config)
                    .await
                    .map_err(|e| AppError::RuleExecution(format!("Interceptor before error: {}", e)))?;
            }

            // Execute node
            let handler = self.node_registry.get(&current.node_type).ok_or_else(|| {
                AppError::RuleExecution(format!("Unknown node type: {}", current.node_type))
            })?;

            let mut node_ctx: crate::node::traits::NodeContext = ctx.clone().into();
            let result = handler.execute(&mut node_ctx, current.config.clone()).await;

            // Sync node_ctx back to ctx
            ctx.variables = node_ctx.variables;
            ctx.node_outputs = node_ctx.node_outputs;

            match result {
                Ok(output) => {
                    // Run after-interceptors
                    for (interceptor, config) in &interceptors {
                        let _ = interceptor
                            .after(&mut ctx, &current.id, &output, config)
                            .await;
                    }

                    match output {
                        NodeOutput::Route(target) => {
                            current = chain.find_node(&target).ok_or_else(|| {
                                AppError::RuleExecution(format!("Route target not found: {}", target))
                            })?;
                        }
                        NodeOutput::Continue => {
                            match chain.next_node(&current.id) {
                                Some(next) => current = next,
                                None => break,
                            }
                        }
                        NodeOutput::Stop => break,
                    }
                }
                Err(e) => {
                    // Run error-interceptors
                    for (interceptor, config) in &interceptors {
                        let _ = interceptor
                            .on_error(&mut ctx, &current.id, &e, config)
                            .await;
                    }
                    return Err(AppError::RuleExecution(format!(
                        "Node '{}' (type '{}') failed: {}",
                        current.id, current.node_type, e
                    )));
                }
            }
        }

        Ok(ctx.output.unwrap_or(Value::Null))
    }
}

impl Clone for RuleEngine {
    fn clone(&self) -> Self {
        Self {
            node_registry: self.node_registry.clone(),
            interceptor_registry: self.interceptor_registry.clone(),
            chain_cache: self.chain_cache.clone(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::dsl::types::{RuleEdge, RuleNode};
    use crate::node::builtins::end::EndNode;
    use crate::node::builtins::start::StartNode;

    async fn make_test_engine() -> RuleEngine {
        let mut node_registry = NodeRegistry::new();
        node_registry.register(Arc::new(StartNode));
        node_registry.register(Arc::new(EndNode));

        let interceptor_registry = InterceptorRegistry::new();
        RuleEngine::new(Arc::new(node_registry), Arc::new(interceptor_registry))
    }

    #[tokio::test]
    async fn test_execute_simple_chain() {
        let engine = make_test_engine().await;
        let chain = RuleChain {
            chain_id: "test-simple".into(),
            version: "1.0".into(),
            nodes: vec![
                RuleNode {
                    id: "start".into(),
                    node_type: "start".into(),
                    config: Default::default(),
                },
                RuleNode {
                    id: "end".into(),
                    node_type: "end".into(),
                    config: Default::default(),
                },
            ],
            edges: vec![RuleEdge {
                from: "start".into(),
                to: "end".into(),
                label: None,
            }],
            interceptor_configs: vec![],
        };

        engine.cache_chain(chain);
        let result = engine
            .execute("test-simple", serde_json::json!({"message": "hello"}))
            .await;
        assert!(result.is_ok());
    }

    #[tokio::test]
    async fn test_execute_nonexistent_chain() {
        let engine = make_test_engine().await;
        let result = engine.execute("nonexistent", Value::Null).await;
        assert!(result.is_err());
    }
}
