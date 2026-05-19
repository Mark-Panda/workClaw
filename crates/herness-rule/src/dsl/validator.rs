use super::types::RuleChain;
use herness_common::error::{AppError, AppResult};
use std::collections::{HashMap, HashSet};

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

    // Detect cycles (as warning, not error — loop/fork nodes intentionally create back-edges)
    if let Some(cycle_node) = detect_cycle(chain) {
        warnings.push(format!(
            "Rule chain contains a cycle involving node '{}'; execution is guarded by max-step limit",
            cycle_node
        ));
    }

    Ok(warnings)
}

/// DFS-based cycle detection. Returns the ID of a node involved in a cycle, if any.
fn detect_cycle(chain: &RuleChain) -> Option<String> {
    let mut adj: HashMap<&str, Vec<&str>> = HashMap::new();
    for edge in &chain.edges {
        adj.entry(&edge.from).or_default().push(&edge.to);
    }

    let mut visited: HashSet<&str> = HashSet::new();
    let mut on_stack: HashSet<&str> = HashSet::new();

    fn dfs<'a>(
        node: &'a str,
        adj: &HashMap<&'a str, Vec<&'a str>>,
        visited: &mut HashSet<&'a str>,
        on_stack: &mut HashSet<&'a str>,
    ) -> Option<&'a str> {
        if on_stack.contains(node) {
            return Some(node);
        }
        if visited.contains(node) {
            return None;
        }
        visited.insert(node);
        on_stack.insert(node);
        if let Some(neighbors) = adj.get(node) {
            for &next in neighbors {
                if let Some(cycle_node) = dfs(next, adj, visited, on_stack) {
                    return Some(cycle_node);
                }
            }
        }
        on_stack.remove(node);
        None
    }

    for node in &chain.nodes {
        if let Some(cycle_node) = dfs(&node.id, &adj, &mut visited, &mut on_stack) {
            return Some(cycle_node.to_string());
        }
    }

    None
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

    #[test]
    fn test_validate_warns_on_cycle() {
        let chain = RuleChain {
            chain_id: "test".into(),
            version: "1.0".into(),
            nodes: vec![
                RuleNode { id: "start".into(), node_type: "start".into(), config: Default::default() },
                RuleNode { id: "a".into(), node_type: "delay".into(), config: Default::default() },
                RuleNode { id: "b".into(), node_type: "delay".into(), config: Default::default() },
                RuleNode { id: "end".into(), node_type: "end".into(), config: Default::default() },
            ],
            edges: vec![
                RuleEdge { from: "start".into(), to: "a".into(), label: None },
                RuleEdge { from: "a".into(), to: "b".into(), label: None },
                RuleEdge { from: "b".into(), to: "a".into(), label: None },
                RuleEdge { from: "a".into(), to: "end".into(), label: None },
            ],
            interceptor_configs: vec![],
        };
        let result = validate(&chain).unwrap();
        assert!(result.iter().any(|w| w.contains("cycle")));
    }

    #[test]
    fn test_validate_no_cycle_warning() {
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
        let result = validate(&chain).unwrap();
        assert!(!result.iter().any(|w| w.contains("cycle")));
    }
}
