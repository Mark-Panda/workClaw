use super::types::RuleChain;
use herness_common::error::{AppError, AppResult};
use std::collections::HashSet;

pub fn validate(chain: &RuleChain) -> AppResult<Vec<String>> {
    let mut warnings = Vec::new();

    // Must have at least one node
    if chain.nodes.is_empty() {
        return Err(AppError::Validation("Rule chain has no nodes".into()));
    }

    // Must have a start node
    if !chain.nodes.iter().any(|n| n.node_type == "start") {
        return Err(AppError::Validation("Rule chain must have a start node".into()));
    }

    // Must have at least one end/terminal node
    let has_end = chain.nodes.iter().any(|n| n.node_type == "end");
    if !has_end {
        warnings.push("Rule chain has no end node; execution may run indefinitely".into());
    }

    // Check for duplicate node IDs
    let mut ids = HashSet::new();
    for node in &chain.nodes {
        if !ids.insert(&node.id) {
            return Err(AppError::Validation(format!(
                "Duplicate node ID: {}",
                node.id
            )));
        }
    }

    // Check edges reference valid nodes
    for edge in &chain.edges {
        if !ids.contains(&edge.from) {
            return Err(AppError::Validation(format!(
                "Edge references unknown source node: {}",
                edge.from
            )));
        }
        if !ids.contains(&edge.to) {
            return Err(AppError::Validation(format!(
                "Edge references unknown target node: {}",
                edge.to
            )));
        }
    }

    Ok(warnings)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::dsl::types::{RuleEdge, RuleNode};

    #[test]
    fn test_validate_valid_chain() {
        let chain = RuleChain {
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
        };
        let result = validate(&chain);
        assert!(result.is_ok());
    }

    #[test]
    fn test_validate_rejects_empty() {
        let chain = RuleChain {
            chain_id: "test".into(),
            version: "1.0".into(),
            nodes: vec![],
            edges: vec![],
            interceptor_configs: vec![],
        };
        assert!(validate(&chain).is_err());
    }

    #[test]
    fn test_validate_rejects_missing_start() {
        let chain = RuleChain {
            chain_id: "test".into(),
            version: "1.0".into(),
            nodes: vec![
                RuleNode { id: "end".into(), node_type: "end".into(), config: Default::default() },
            ],
            edges: vec![],
            interceptor_configs: vec![],
        };
        assert!(validate(&chain).is_err());
    }

    #[test]
    fn test_validate_rejects_duplicate_ids() {
        let chain = RuleChain {
            chain_id: "test".into(),
            version: "1.0".into(),
            nodes: vec![
                RuleNode { id: "start".into(), node_type: "start".into(), config: Default::default() },
                RuleNode { id: "start".into(), node_type: "end".into(), config: Default::default() },
            ],
            edges: vec![],
            interceptor_configs: vec![],
        };
        assert!(validate(&chain).is_err());
    }
}
