use async_trait::async_trait;
use rhai::{Engine, Scope};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::sync::{Arc, OnceLock};
use tokio::sync::Mutex;

use crate::engine::RuleEngine;
use crate::node::traits::{NodeContext, NodeHandler, NodeOutput};
use herness_common::error::{AppError, AppResult};

/// A branch definition with an inline condition.
/// The Switch node evaluates conditions itself before executing any branch.
#[derive(Debug, Serialize, Deserialize, Clone)]
struct BranchDef {
    /// Rhai expression to evaluate. Empty = default branch (always matches).
    #[serde(default)]
    condition: String,
    /// First node in the branch chain
    start_id: String,
    /// Last node in the branch chain (exclusive)
    #[serde(default)]
    end_id: String,
}

#[derive(Debug, Serialize, Deserialize)]
struct SwitchConfig {
    #[serde(default)]
    branches: Vec<BranchDef>,
    join_at: String,
}

pub struct SwitchNode {
    engine: Mutex<Option<Arc<RuleEngine>>>,
}

impl SwitchNode {
    pub fn new() -> Self {
        Self {
            engine: Mutex::new(None),
        }
    }

    pub async fn set_engine(&self, engine: Arc<RuleEngine>) {
        *self.engine.lock().await = Some(engine);
    }
}

impl Default for SwitchNode {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait]
impl NodeHandler for SwitchNode {
    fn node_type(&self) -> &'static str {
        "switch"
    }

    async fn execute(&self, ctx: &mut NodeContext, config: Value) -> AppResult<NodeOutput> {
        let cfg: SwitchConfig =
            serde_json::from_value(config).map_err(|e| AppError::Validation(e.to_string()))?;

        let engine = self
            .engine
            .lock()
            .await
            .clone()
            .ok_or_else(|| AppError::RuleExecution("SwitchNode: no engine configured".into()))?;

        let chain_id = ctx.chain_id.clone();

        // Evaluate conditions first-match-wins, execute only the matching branch
        let mut final_ctx = None;
        for branch in &cfg.branches {
            let matched = eval_branch_condition(&branch.condition, ctx)?;

            if matched {
                let branch_ctx = engine
                    .execute_chain_segment(
                        &chain_id,
                        &branch.start_id,
                        &branch.end_id,
                        ctx.clone(),
                    )
                    .await?;

                final_ctx = Some(branch_ctx);
                break;
            }
        }

        if let Some(found_ctx) = final_ctx {
            ctx.variables = found_ctx.variables;
            ctx.node_outputs = found_ctx.node_outputs;
        }

        Ok(NodeOutput::Route(cfg.join_at))
    }

    fn validate_config(&self, config: &Value) -> AppResult<()> {
        let join = config.get("join_at").and_then(|v| v.as_str()).unwrap_or("");
        if join.trim().is_empty() {
            return Err(AppError::Validation("join_at must not be empty".into()));
        }

        // Validate that branch conditions compile
        if let Some(branches) = config.get("branches").and_then(|v| v.as_array()) {
            let rhai_engine = get_rhai_engine();
            for branch in branches {
                if let Some(cond) = branch.get("condition").and_then(|v| v.as_str()) {
                    if !cond.trim().is_empty() {
                        rhai_engine
                            .compile_expression(cond)
                            .map_err(|e| AppError::Validation(format!("Switch condition compile error: {}", e)))?;
                    }
                }
            }
        }

        Ok(())
    }
}

fn get_rhai_engine() -> &'static Engine {
    static ENGINE: OnceLock<Engine> = OnceLock::new();
    ENGINE.get_or_init(|| {
        let mut engine = Engine::new();
        engine.register_fn("contains", |s: String, sub: String| s.contains(&sub));
        engine.register_fn("startsWith", |s: String, prefix: String| s.starts_with(&prefix));
        engine.register_fn("endsWith", |s: String, suffix: String| s.ends_with(&suffix));
        engine.register_fn("len", |s: String| -> rhai::INT { s.len() as rhai::INT });
        engine
    })
}

/// Evaluate a branch condition expression.
/// Empty condition = default branch (always true).
fn eval_branch_condition(condition: &str, ctx: &NodeContext) -> AppResult<bool> {
    let trimmed = condition.trim();
    if trimmed.is_empty() {
        return Ok(true);
    }

    let engine = get_rhai_engine();
    let mut scope = Scope::new();

    for (key, value) in &ctx.variables {
        if let Some(rv) = serde_to_rhai(value) {
            scope.push(key.as_str(), rv);
        }
    }
    if let Some(rv) = serde_to_rhai(&ctx.input) {
        scope.push("input", rv);
    }

    let result: bool = engine
        .eval_expression_with_scope(&mut scope, trimmed)
        .map_err(|e| AppError::RuleExecution(format!("Switch condition eval error: {}", e)))?;

    Ok(result)
}

fn serde_to_rhai(value: &Value) -> Option<rhai::Dynamic> {
    match value {
        Value::Null => None,
        Value::Bool(b) => Some(rhai::Dynamic::from(*b)),
        Value::Number(n) => {
            if let Some(i) = n.as_i64() {
                Some(rhai::Dynamic::from(i))
            } else if let Some(f) = n.as_f64() {
                Some(rhai::Dynamic::from(f))
            } else {
                None
            }
        }
        Value::String(s) => Some(rhai::Dynamic::from(s.clone())),
        Value::Array(arr) => {
            let items: rhai::Array = arr.iter().filter_map(serde_to_rhai).collect();
            Some(rhai::Dynamic::from(items))
        }
        Value::Object(obj) => {
            let mut map = rhai::Map::new();
            for (k, v) in obj {
                if let Some(rv) = serde_to_rhai(v) {
                    map.insert(k.clone().into(), rv);
                }
            }
            Some(rhai::Dynamic::from(map))
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_switch_requires_join_at() {
        let node = SwitchNode::new();
        let result = node.validate_config(&serde_json::json!({"join_at": ""}));
        assert!(result.is_err());
    }

    #[test]
    fn test_eval_empty_condition_matches() {
        let ctx = NodeContext::new(Value::Null);
        assert!(eval_branch_condition("", &ctx).unwrap());
        assert!(eval_branch_condition("   ", &ctx).unwrap());
    }

    #[test]
    fn test_eval_simple_boolean() {
        let ctx = NodeContext::new(Value::Null);
        assert!(eval_branch_condition("1 == 1", &ctx).unwrap());
        assert!(!eval_branch_condition("1 == 0", &ctx).unwrap());
    }

    #[test]
    fn test_eval_with_variable() {
        let mut ctx = NodeContext::new(Value::Null);
        ctx.set_var("status", serde_json::json!("ok"));
        assert!(eval_branch_condition("status == \"ok\"", &ctx).unwrap());
        assert!(!eval_branch_condition("status == \"fail\"", &ctx).unwrap());
    }

    #[test]
    fn test_validate_bad_condition() {
        let node = SwitchNode::new();
        let result = node.validate_config(&serde_json::json!({
            "join_at": "j1",
            "branches": [{"condition": "1 +", "start_id": "s1", "end_id": "e1"}]
        }));
        assert!(result.is_err());
    }
}
