use async_trait::async_trait;
use serde_json::Value;
use tracing::info;

use crate::engine::context::ExecutionContext;
use crate::interceptor::Interceptor;
use crate::node::traits::NodeOutput;
use herness_common::error::{AppError, AppResult};

pub struct LoggingInterceptor;

#[async_trait]
impl Interceptor for LoggingInterceptor {
    fn interceptor_type(&self) -> &'static str {
        "logging"
    }

    async fn before(
        &self,
        _ctx: &mut ExecutionContext,
        node_id: &str,
        _config: &Value,
    ) -> AppResult<()> {
        info!("[interceptor:logging] Entering node: {}", node_id);
        Ok(())
    }

    async fn after(
        &self,
        _ctx: &mut ExecutionContext,
        node_id: &str,
        _result: &NodeOutput,
        _config: &Value,
    ) -> AppResult<()> {
        info!("[interceptor:logging] Exiting node: {}", node_id);
        Ok(())
    }

    async fn on_error(
        &self,
        _ctx: &mut ExecutionContext,
        node_id: &str,
        error: &AppError,
        _config: &Value,
    ) -> AppResult<()> {
        info!(
            "[interceptor:logging] Error in node {}: {}",
            node_id, error
        );
        Ok(())
    }
}
