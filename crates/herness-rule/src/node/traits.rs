use async_trait::async_trait;
use herness_common::error::AppResult;
use serde_json::Value;
use std::collections::HashMap;

/// Execution context passed to each node during rule chain execution.
#[derive(Debug, Clone, Default)]
pub struct NodeContext {
    /// Variables shared across the rule chain execution
    pub variables: HashMap<String, Value>,
    /// Output of previously executed nodes keyed by node_id
    pub node_outputs: HashMap<String, Value>,
    /// The original input to the rule chain
    pub input: Value,
}

impl NodeContext {
    pub fn new(input: Value) -> Self {
        Self {
            variables: HashMap::new(),
            node_outputs: HashMap::new(),
            input,
        }
    }

    pub fn set_var(&mut self, key: &str, value: Value) {
        self.variables.insert(key.to_string(), value);
    }

    pub fn get_var(&self, key: &str) -> Option<&Value> {
        self.variables.get(key)
    }

    pub fn set_output(&mut self, node_id: &str, output: Value) {
        self.node_outputs.insert(node_id.to_string(), output);
    }
}

/// Output of executing a single node in the rule chain.
#[derive(Debug, Clone)]
pub enum NodeOutput {
    /// Route to a specific next node by its id
    Route(String),
    /// Continue to the default next node
    Continue,
    /// Stop execution of the rule chain
    Stop,
}

/// A node handler processes a single step in a rule chain.
#[async_trait]
pub trait NodeHandler: Send + Sync {
    /// Unique node type identifier (e.g., "condition", "rest_client", "delay")
    fn node_type(&self) -> &'static str;

    /// Execute this node with the given context and configuration.
    async fn execute(
        &self,
        ctx: &mut NodeContext,
        config: Value,
    ) -> AppResult<NodeOutput>;

    /// Validate the node configuration. Returns Ok(()) if valid.
    fn validate_config(&self, config: &Value) -> AppResult<()> {
        let _ = config;
        Ok(())
    }
}
