use super::types::{JsonRuleChain, RuleChain, RuleEdge, RuleNode};
use herness_common::error::{AppError, AppResult};

pub fn parse(json: &str) -> AppResult<RuleChain> {
    let json_chain: JsonRuleChain =
        serde_json::from_str(json).map_err(|e| AppError::Validation(format!("Invalid DSL JSON: {}", e)))?;

    let nodes: Vec<RuleNode> = json_chain
        .nodes
        .into_iter()
        .map(|n| RuleNode {
            id: n.id,
            node_type: n.node_type,
            config: n.config,
        })
        .collect();

    let edges: Vec<RuleEdge> = json_chain
        .edges
        .into_iter()
        .map(|e| RuleEdge {
            from: e.from,
            to: e.to,
            label: e.label,
        })
        .collect();

    Ok(RuleChain {
        chain_id: json_chain.chain_id,
        version: json_chain.version,
        nodes,
        edges,
        interceptor_configs: json_chain.interceptors,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_simple_chain() {
        let json = r#"{
            "chain_id": "test",
            "nodes": [
                {"id": "start", "type": "start", "config": {}},
                {"id": "end", "type": "end", "config": {}}
            ],
            "edges": [
                {"from": "start", "to": "end"}
            ]
        }"#;
        let chain = parse(json).unwrap();
        assert_eq!(chain.chain_id, "test");
        assert_eq!(chain.nodes.len(), 2);
        assert_eq!(chain.edges.len(), 1);
    }

    #[test]
    fn test_parse_invalid_json() {
        assert!(parse("not json").is_err());
    }
}
