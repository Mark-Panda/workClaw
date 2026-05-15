use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::node::traits::{NodeContext, NodeHandler, NodeOutput};
use herness_common::error::{AppError, AppResult};

#[derive(Debug, Serialize, Deserialize)]
struct RestClientConfig {
    url: String,
    method: Option<String>,
    body_template: Option<String>,
}

pub struct RestClientNode;

#[async_trait]
impl NodeHandler for RestClientNode {
    fn node_type(&self) -> &'static str {
        "rest_client"
    }

    async fn execute(&self, ctx: &mut NodeContext, config: Value) -> AppResult<NodeOutput> {
        let cfg: RestClientConfig =
            serde_json::from_value(config).map_err(|e| AppError::Validation(e.to_string()))?;

        let _method = cfg.method.unwrap_or_else(|| "GET".to_string());
        // In production, this would make actual HTTP requests via reqwest
        ctx.set_var("rest_client_url", Value::String(cfg.url));
        Ok(NodeOutput::Continue)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_rest_client_sets_url() {
        let node = RestClientNode;
        let mut ctx = NodeContext::new(Value::Null);
        let config = serde_json::json!({"url": "https://api.example.com/data"});
        let result = node.execute(&mut ctx, config).await.unwrap();
        match result {
            NodeOutput::Continue => {
                assert_eq!(
                    ctx.get_var("rest_client_url"),
                    Some(&Value::String("https://api.example.com/data".into()))
                );
            }
            _ => panic!("Expected Continue"),
        }
    }
}
