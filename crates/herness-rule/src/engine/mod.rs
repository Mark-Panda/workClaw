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
use std::time::Duration;

#[derive(Debug, Clone)]
pub struct EngineConfig {
    pub max_steps: u32,
    pub execution_timeout_secs: u64,
}

impl Default for EngineConfig {
    fn default() -> Self {
        Self {
            max_steps: 1000,
            execution_timeout_secs: 300,
        }
    }
}

impl EngineConfig {
    /// Validate configuration values, returning an error for invalid settings.
    pub fn validate(&self) -> AppResult<()> {
        if self.max_steps == 0 {
            return Err(AppError::Validation(
                "engine max_steps must be > 0".into(),
            ));
        }
        if self.execution_timeout_secs == 0 {
            return Err(AppError::Validation(
                "engine execution_timeout_secs must be > 0".into(),
            ));
        }
        Ok(())
    }
}

pub struct RuleEngine {
    node_registry: Arc<NodeRegistry>,
    interceptor_registry: Arc<InterceptorRegistry>,
    chain_cache: Arc<DashMap<String, Arc<RuleChain>>>,
    config: EngineConfig,
}

impl RuleEngine {
    pub fn new(
        node_registry: Arc<NodeRegistry>,
        interceptor_registry: Arc<InterceptorRegistry>,
        config: EngineConfig,
    ) -> Self {
        if let Err(e) = config.validate() {
            tracing::warn!("Invalid engine config: {}, using defaults", e);
        }
        Self {
            node_registry,
            interceptor_registry,
            chain_cache: Arc::new(DashMap::new()),
            config,
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

    pub fn cached_chain_count(&self) -> usize {
        self.chain_cache.len()
    }

    pub fn cached_chain_ids(&self) -> Vec<String> {
        self.chain_cache.iter().map(|r| r.key().clone()).collect()
    }

    pub fn node_registry(&self) -> &Arc<NodeRegistry> {
        &self.node_registry
    }

    pub fn interceptor_registry(&self) -> &Arc<InterceptorRegistry> {
        &self.interceptor_registry
    }

    /// Preload chains from an iterator of (id, dsl_json) pairs into the engine cache.
    pub fn preload_chains_from<I>(&self, chains: I) -> usize
    where
        I: IntoIterator<Item = (String, String)>,
    {
        let mut count = 0;
        for (id, dsl_str) in chains {
            match crate::dsl::parser::parse(&dsl_str) {
                Ok(chain) => {
                    self.cache_chain(chain);
                    count += 1;
                }
                Err(e) => {
                    tracing::warn!("Failed to parse chain {}: {}", id, e);
                }
            }
        }
        tracing::info!("Preloaded {} enabled rule chains into engine cache", count);
        count
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

        let max_steps = self.config.max_steps;
        let timeout_duration = Duration::from_secs(self.config.execution_timeout_secs);

        let result = tokio::time::timeout(timeout_duration, async {
            let mut steps: u32 = 0;
            loop {
                steps += 1;
                if steps > max_steps {
                    return Err(AppError::RuleExecution(
                        format!("Max steps ({}) exceeded — possible infinite loop", max_steps)
                    ));
                }

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

                let mut node_ctx: crate::node::traits::NodeContext = {
                    let mut nctx: crate::node::traits::NodeContext = ctx.clone().into();
                    nctx.chain_id = chain_id.to_string();
                    nctx.current_node_id = current.id.clone();
                    nctx
                };
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
        })
        .await
        .map_err(|_| {
            AppError::RuleExecution(
                format!("Execution timed out after {}s", self.config.execution_timeout_secs)
            )
        })?;

        result
    }

    /// Execute a segment of a chain from `start_node_id` to `end_node_id` (exclusive).
    /// Returns the final NodeContext after executing all nodes in the segment.
    /// This is used by LoopNode and ForkNode to execute body branches.
    pub async fn execute_chain_segment(
        &self,
        chain_id: &str,
        start_node_id: &str,
        end_node_id: &str,
        mut ctx: crate::node::traits::NodeContext,
    ) -> AppResult<crate::node::traits::NodeContext> {
        let chain = self
            .get_chain(chain_id)
            .ok_or_else(|| AppError::NotFound(format!("Rule chain not found: {}", chain_id)))?;

        let max_steps = self.config.max_steps;
        // Segment timeout: proportional to the total timeout but capped.
        // A segment shouldn't consume the entire chain timeout.
        let segment_timeout = Duration::from_secs(self.config.execution_timeout_secs);

        let result = tokio::time::timeout(segment_timeout, async {
            let mut steps: u32 = 0;
            let mut current_id = start_node_id.to_string();
            loop {
                steps += 1;
                if steps > max_steps {
                    return Err(AppError::RuleExecution(
                        format!("Max steps ({}) exceeded in chain segment — possible infinite loop", max_steps)
                    ));
                }

                let current = match chain.find_node(&current_id) {
                    Some(n) => n,
                    None => break,
                };

                let handler = self.node_registry.get(&current.node_type).ok_or_else(|| {
                    AppError::RuleExecution(format!("Unknown node type: {}", current.node_type))
                })?;

                ctx.chain_id = chain_id.to_string();
                ctx.current_node_id = current.id.clone();

                let result = handler.execute(&mut ctx, current.config.clone()).await?;

                match result {
                    NodeOutput::Continue => {
                        match chain.next_node(&current_id) {
                            Some(next) => {
                                if next.id == end_node_id || next.node_type == "end" {
                                    break;
                                }
                                current_id = next.id.clone();
                            }
                            None => break,
                        }
                    }
                    NodeOutput::Route(target) => {
                        if target == end_node_id {
                            break;
                        }
                        current_id = target;
                    }
                    NodeOutput::Stop => break,
                }
            }

            Ok(ctx)
        })
        .await
        .map_err(|_| {
            AppError::RuleExecution(
                format!("Chain segment timed out after {}s", self.config.execution_timeout_secs)
            )
        })?;

        result
    }
}

impl Clone for RuleEngine {
    fn clone(&self) -> Self {
        Self {
            node_registry: self.node_registry.clone(),
            interceptor_registry: self.interceptor_registry.clone(),
            chain_cache: self.chain_cache.clone(),
            config: self.config.clone(),
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
        RuleEngine::new(Arc::new(node_registry), Arc::new(interceptor_registry), EngineConfig::default())
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

    #[tokio::test]
    async fn test_cached_chain_count() {
        let engine = make_test_engine().await;
        assert_eq!(engine.cached_chain_count(), 0);

        let chain = RuleChain {
            chain_id: "test-count".into(),
            version: "1.0".into(),
            nodes: vec![
                RuleNode { id: "start".into(), node_type: "start".into(), config: Default::default() },
                RuleNode { id: "end".into(), node_type: "end".into(), config: Default::default() },
            ],
            edges: vec![RuleEdge { from: "start".into(), to: "end".into(), label: None }],
            interceptor_configs: vec![],
        };
        engine.cache_chain(chain);
        assert_eq!(engine.cached_chain_count(), 1);
    }

    #[tokio::test]
    async fn test_uncache_chain() {
        let engine = make_test_engine().await;
        let chain = RuleChain {
            chain_id: "test-uncache".into(),
            version: "1.0".into(),
            nodes: vec![
                RuleNode { id: "start".into(), node_type: "start".into(), config: Default::default() },
                RuleNode { id: "end".into(), node_type: "end".into(), config: Default::default() },
            ],
            edges: vec![RuleEdge { from: "start".into(), to: "end".into(), label: None }],
            interceptor_configs: vec![],
        };
        engine.cache_chain(chain);
        assert!(engine.get_chain("test-uncache").is_some());
        engine.uncache_chain("test-uncache");
        assert!(engine.get_chain("test-uncache").is_none());
    }

    #[test]
    fn test_engine_config_validate_ok() {
        let config = EngineConfig::default();
        assert!(config.validate().is_ok());
    }

    #[test]
    fn test_engine_config_rejects_zero_max_steps() {
        let config = EngineConfig { max_steps: 0, execution_timeout_secs: 300 };
        assert!(config.validate().is_err());
    }

    #[test]
    fn test_engine_config_rejects_zero_timeout() {
        let config = EngineConfig { max_steps: 1000, execution_timeout_secs: 0 };
        assert!(config.validate().is_err());
    }
}
