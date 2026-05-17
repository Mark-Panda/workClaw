use async_trait::async_trait;
use serde_json::Value;
use std::sync::atomic::{AtomicU64, Ordering};

use crate::interceptor::Interceptor;

pub struct MetricsInterceptor {
    node_executions: AtomicU64,
    node_errors: AtomicU64,
}

impl Default for MetricsInterceptor {
    fn default() -> Self {
        Self::new()
    }
}

impl MetricsInterceptor {
    pub fn new() -> Self {
        Self {
            node_executions: AtomicU64::new(0),
            node_errors: AtomicU64::new(0),
        }
    }

    pub fn node_executions(&self) -> u64 {
        self.node_executions.load(Ordering::Relaxed)
    }

    pub fn node_errors(&self) -> u64 {
        self.node_errors.load(Ordering::Relaxed)
    }
}

#[async_trait]
impl Interceptor for MetricsInterceptor {
    fn interceptor_type(&self) -> &'static str {
        "metrics"
    }

    async fn after(
        &self,
        _ctx: &mut crate::engine::context::ExecutionContext,
        _node_id: &str,
        _result: &crate::node::traits::NodeOutput,
        _config: &Value,
    ) -> herness_common::error::AppResult<()> {
        self.node_executions.fetch_add(1, Ordering::Relaxed);
        Ok(())
    }

    async fn on_error(
        &self,
        _ctx: &mut crate::engine::context::ExecutionContext,
        _node_id: &str,
        _error: &herness_common::error::AppError,
        _config: &Value,
    ) -> herness_common::error::AppResult<()> {
        self.node_errors.fetch_add(1, Ordering::Relaxed);
        Ok(())
    }
}
