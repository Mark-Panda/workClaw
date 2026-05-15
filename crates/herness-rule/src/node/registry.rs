use super::traits::NodeHandler;
use std::collections::HashMap;
use std::sync::Arc;

/// Registry for node handler types. Maps node type names to their handler implementations.
#[derive(Clone, Default)]
pub struct NodeRegistry {
    handlers: HashMap<String, Arc<dyn NodeHandler>>,
}

impl NodeRegistry {
    pub fn new() -> Self {
        Self {
            handlers: HashMap::new(),
        }
    }

    pub fn register(&mut self, handler: Arc<dyn NodeHandler>) {
        self.handlers
            .insert(handler.node_type().to_string(), handler);
    }

    pub fn get(&self, node_type: &str) -> Option<&Arc<dyn NodeHandler>> {
        self.handlers.get(node_type)
    }

    pub fn list_types(&self) -> Vec<&str> {
        self.handlers.keys().map(|k| k.as_str()).collect()
    }

    pub fn len(&self) -> usize {
        self.handlers.len()
    }

    pub fn is_empty(&self) -> bool {
        self.handlers.is_empty()
    }

    pub fn contains(&self, node_type: &str) -> bool {
        self.handlers.contains_key(node_type)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::node::traits::{NodeContext, NodeOutput};
    use async_trait::async_trait;
    use serde_json::Value;

    struct TestNode;

    #[async_trait]
    impl NodeHandler for TestNode {
        fn node_type(&self) -> &'static str {
            "test_node"
        }

        async fn execute(
            &self,
            _ctx: &mut NodeContext,
            _config: Value,
        ) -> herness_common::error::AppResult<NodeOutput> {
            Ok(NodeOutput::Continue)
        }
    }

    #[test]
    fn test_register_and_get() {
        let mut registry = NodeRegistry::new();
        registry.register(Arc::new(TestNode));
        assert_eq!(registry.len(), 1);
        assert!(registry.contains("test_node"));
        assert!(!registry.contains("nonexistent"));
    }
}
