pub mod builtins;

use async_trait::async_trait;
use std::collections::HashMap;
use std::sync::Arc;

use crate::dsl::types::InterceptorConfig;
use crate::engine::context::ExecutionContext;
use crate::node::traits::NodeOutput;
use herness_common::error::{AppError, AppResult};
use serde_json::Value;

#[async_trait]
pub trait Interceptor: Send + Sync {
    fn interceptor_type(&self) -> &'static str;

    async fn before(
        &self,
        _ctx: &mut ExecutionContext,
        _node_id: &str,
        _config: &Value,
    ) -> AppResult<()> {
        Ok(())
    }

    async fn after(
        &self,
        _ctx: &mut ExecutionContext,
        _node_id: &str,
        _result: &NodeOutput,
        _config: &Value,
    ) -> AppResult<()> {
        Ok(())
    }

    async fn on_error(
        &self,
        _ctx: &mut ExecutionContext,
        _node_id: &str,
        _error: &AppError,
        _config: &Value,
    ) -> AppResult<()> {
        Ok(())
    }
}

#[derive(Clone, Default)]
pub struct InterceptorRegistry {
    interceptors: HashMap<String, Arc<dyn Interceptor>>,
}

impl InterceptorRegistry {
    pub fn new() -> Self {
        Self {
            interceptors: HashMap::new(),
        }
    }

    pub fn register(&mut self, interceptor: Arc<dyn Interceptor>) {
        self.interceptors
            .insert(interceptor.interceptor_type().to_string(), interceptor);
    }

    pub fn get_enabled_interceptors(
        &self,
        configs: &[InterceptorConfig],
    ) -> Vec<(Arc<dyn Interceptor>, Value)> {
        configs
            .iter()
            .filter_map(|cfg| {
                self.interceptors
                    .get(&cfg.interceptor_type)
                    .cloned()
                    .map(|interceptor| (interceptor, cfg.config.clone()))
            })
            .collect()
    }

    pub fn list_types(&self) -> Vec<&str> {
        self.interceptors.keys().map(|k| k.as_str()).collect()
    }

    pub fn contains(&self, interceptor_type: &str) -> bool {
        self.interceptors.contains_key(interceptor_type)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    struct TestInterceptor;

    #[async_trait]
    impl Interceptor for TestInterceptor {
        fn interceptor_type(&self) -> &'static str {
            "test"
        }
    }

    #[test]
    fn test_register_and_get() {
        let mut registry = InterceptorRegistry::new();
        registry.register(Arc::new(TestInterceptor));

        let configs = vec![InterceptorConfig {
            interceptor_type: "test".into(),
            config: serde_json::Value::Null,
        }];
        let enabled = registry.get_enabled_interceptors(&configs);
        assert_eq!(enabled.len(), 1);
    }
}
