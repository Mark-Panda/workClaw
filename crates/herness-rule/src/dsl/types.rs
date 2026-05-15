use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JsonRuleChain {
    pub chain_id: String,
    #[serde(default = "default_version")]
    pub version: String,
    pub nodes: Vec<JsonNode>,
    #[serde(default)]
    pub edges: Vec<JsonEdge>,
    #[serde(default)]
    pub interceptors: Vec<InterceptorConfig>,
}

fn default_version() -> String {
    "1.0".to_string()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JsonNode {
    pub id: String,
    #[serde(rename = "type")]
    pub node_type: String,
    #[serde(default)]
    pub config: serde_json::Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JsonEdge {
    pub from: String,
    pub to: String,
    #[serde(default)]
    pub label: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InterceptorConfig {
    #[serde(rename = "type")]
    pub interceptor_type: String,
    #[serde(default)]
    pub config: serde_json::Value,
}

/// Internal representation of a parsed and validated rule chain
#[derive(Debug, Clone)]
pub struct RuleChain {
    pub chain_id: String,
    pub version: String,
    pub nodes: Vec<RuleNode>,
    pub edges: Vec<RuleEdge>,
    pub interceptor_configs: Vec<InterceptorConfig>,
}

#[derive(Debug, Clone)]
pub struct RuleNode {
    pub id: String,
    pub node_type: String,
    pub config: serde_json::Value,
}

#[derive(Debug, Clone)]
pub struct RuleEdge {
    pub from: String,
    pub to: String,
    pub label: Option<String>,
}

impl RuleChain {
    pub fn head_node(&self) -> Option<&RuleNode> {
        self.nodes.iter().find(|n| n.node_type == "start")
    }

    pub fn find_node(&self, id: &str) -> Option<&RuleNode> {
        self.nodes.iter().find(|n| n.id == id)
    }

    pub fn next_node(&self, current_id: &str) -> Option<&RuleNode> {
        let edge = self.edges.iter().find(|e| e.from == current_id)?;
        self.find_node(&edge.to)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_test_chain() -> RuleChain {
        RuleChain {
            chain_id: "test".into(),
            version: "1.0".into(),
            nodes: vec![
                RuleNode { id: "start".into(), node_type: "start".into(), config: Default::default() },
                RuleNode { id: "end".into(), node_type: "end".into(), config: Default::default() },
            ],
            edges: vec![
                RuleEdge { from: "start".into(), to: "end".into(), label: None },
            ],
            interceptor_configs: vec![],
        }
    }

    #[test]
    fn test_head_node() {
        let chain = make_test_chain();
        let head = chain.head_node().unwrap();
        assert_eq!(head.id, "start");
    }

    #[test]
    fn test_next_node() {
        let chain = make_test_chain();
        let next = chain.next_node("start").unwrap();
        assert_eq!(next.id, "end");
    }
}
