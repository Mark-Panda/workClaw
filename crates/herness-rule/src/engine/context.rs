use serde_json::Value;
use std::collections::HashMap;

#[derive(Debug, Clone)]
pub struct ExecutionContext {
    pub variables: HashMap<String, Value>,
    pub node_outputs: HashMap<String, Value>,
    pub input: Value,
    pub output: Option<Value>,
}

impl ExecutionContext {
    pub fn new(input: Value) -> Self {
        Self {
            variables: HashMap::new(),
            node_outputs: HashMap::new(),
            input,
            output: None,
        }
    }

    pub fn set_var(&mut self, key: &str, value: Value) {
        self.variables.insert(key.to_string(), value);
    }

    pub fn get_var(&self, key: &str) -> Option<&Value> {
        self.variables.get(key)
    }

    pub fn set_output(&mut self, node_id: &str, value: Value) {
        self.node_outputs.insert(node_id.to_string(), value);
    }
}

impl From<ExecutionContext> for crate::node::traits::NodeContext {
    fn from(val: ExecutionContext) -> Self {
        crate::node::traits::NodeContext {
            variables: val.variables,
            node_outputs: val.node_outputs,
            input: val.input,
        }
    }
}
