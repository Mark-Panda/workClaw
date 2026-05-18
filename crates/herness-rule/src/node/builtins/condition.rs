use async_trait::async_trait;
use rhai::{Engine, Scope};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::sync::OnceLock;

use crate::node::traits::{NodeContext, NodeHandler, NodeOutput};
use herness_common::error::{AppError, AppResult};

/// Condition node configuration — evaluates a Rhai expression and routes accordingly.
#[derive(Debug, Serialize, Deserialize)]
struct ConditionConfig {
    /// Rhai expression to evaluate
    expression: String,
    /// Node ID for the true branch
    #[serde(default)]
    true_branch: Option<String>,
    /// Node ID for the false branch
    #[serde(default)]
    false_branch: Option<String>,
}

pub struct ConditionNode;

#[async_trait]
impl NodeHandler for ConditionNode {
    fn node_type(&self) -> &'static str {
        "condition"
    }

    async fn execute(&self, ctx: &mut NodeContext, config: Value) -> AppResult<NodeOutput> {
        let cfg: ConditionConfig =
            serde_json::from_value(config).map_err(|e| AppError::Validation(e.to_string()))?;

        // Empty expression = passthrough
        if cfg.expression.trim().is_empty() {
            return Ok(NodeOutput::Continue);
        }

        let result = evaluate_expr(&cfg.expression, ctx)?;

        if result {
            match &cfg.true_branch {
                Some(target) => Ok(NodeOutput::Route(target.clone())),
                None => Ok(NodeOutput::Continue),
            }
        } else {
            match &cfg.false_branch {
                Some(target) => Ok(NodeOutput::Route(target.clone())),
                None => Ok(NodeOutput::Stop),
            }
        }
    }

    fn validate_config(&self, config: &Value) -> AppResult<()> {
        let expr = config
            .get("expression")
            .and_then(|v| v.as_str())
            .unwrap_or("");
        if expr.trim().is_empty() {
            return Ok(()); // No expression = passthrough
        }
        let engine = get_engine();
        engine
            .compile_expression(expr)
            .map_err(|e| AppError::Validation(format!("Condition expression compile error: {}", e)))?;
        Ok(())
    }
}

/// Get or create a lazy-initialized Rhai engine with all registered custom functions.
fn get_engine() -> &'static Engine {
    static ENGINE: OnceLock<Engine> = OnceLock::new();
    ENGINE.get_or_init(|| {
        let mut engine = Engine::new();

        // contains(str, substr)
        engine.register_fn("contains", |s: String, sub: String| s.contains(&sub));

        // startsWith(str, prefix)
        engine.register_fn("startsWith", |s: String, prefix: String| {
            s.starts_with(&prefix)
        });

        // endsWith(str, suffix)
        engine.register_fn("endsWith", |s: String, suffix: String| {
            s.ends_with(&suffix)
        });

        // matches(str, pattern) — regex match
        engine.register_fn(
            "matches",
            |s: String, pattern: String| -> Result<bool, Box<rhai::EvalAltResult>> {
                let re = regex::Regex::new(&pattern).map_err(|e| {
                    Box::new(rhai::EvalAltResult::ErrorRuntime(
                        rhai::Dynamic::from(format!("invalid regex: {}", e)),
                        rhai::Position::NONE,
                    ))
                })?;
                Ok(re.is_match(&s))
            },
        );

        // len(str) — string length
        engine.register_fn("len", |s: String| -> rhai::INT { s.len() as rhai::INT });

        // count(collection) — element count
        engine.register_fn(
            "count",
            |arr: rhai::Dynamic| -> rhai::INT {
                if arr.is_array() {
                    arr.into_array()
                        .map(|a| a.len() as rhai::INT)
                        .unwrap_or(0)
                } else if let Some(s) = arr.clone().into_string().ok() {
                    s.len() as rhai::INT
                } else {
                    0
                }
            },
        );

        // in_(value, collection) — value membership
        engine.register_fn(
            "in_",
            |value: rhai::Dynamic, collection: rhai::Dynamic| -> bool {
                if collection.is_array() {
                    if let Ok(arr) = collection.clone().into_array() {
                        let value_str = format!("{}", value);
                        arr.iter().any(|item| format!("{}", item) == value_str)
                    } else {
                        false
                    }
                } else if let Some(s) = collection.clone().into_string().ok() {
                    let v_str = format!("{}", value);
                    s.contains(&v_str)
                } else {
                    false
                }
            },
        );

        engine
    })
}

fn evaluate_expr(expr: &str, ctx: &NodeContext) -> AppResult<bool> {
    let engine = get_engine();
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
        .eval_expression_with_scope(&mut scope, expr)
        .map_err(|e| AppError::RuleExecution(format!("Condition eval error: {}", e)))?;

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
    async fn test_condition_true_routes_to_true_branch() {
        let node = ConditionNode;
        let mut ctx = NodeContext::new(Value::Null);
        let config = serde_json::json!({
            "expression": "1 == 1",
            "true_branch": "node_true",
            "false_branch": "node_false"
        });
        let result = node.execute(&mut ctx, config).await.unwrap();
        match result {
            NodeOutput::Route(target) => assert_eq!(target, "node_true"),
            _ => panic!("Expected Route"),
        }
    }

    #[tokio::test]
    async fn test_condition_false_routes_to_false_branch() {
        let node = ConditionNode;
        let mut ctx = NodeContext::new(Value::Null);
        let config = serde_json::json!({
            "expression": "1 == 0",
            "true_branch": "node_true",
            "false_branch": "node_false"
        });
        let result = node.execute(&mut ctx, config).await.unwrap();
        match result {
            NodeOutput::Route(target) => assert_eq!(target, "node_false"),
            _ => panic!("Expected Route"),
        }
    }

    #[tokio::test]
    async fn test_condition_continue_when_true_no_branch() {
        let node = ConditionNode;
        let mut ctx = NodeContext::new(Value::Null);
        ctx.set_var("x", serde_json::json!(42));
        let config = serde_json::json!({ "expression": "x == 42" });
        let result = node.execute(&mut ctx, config).await.unwrap();
        assert!(matches!(result, NodeOutput::Continue));
    }

    #[tokio::test]
    async fn test_condition_false_stops_when_no_branch() {
        let node = ConditionNode;
        let mut ctx = NodeContext::new(Value::Null);
        let config = serde_json::json!({ "expression": "1 == 0" });
        let result = node.execute(&mut ctx, config).await.unwrap();
        assert!(matches!(result, NodeOutput::Stop));
    }

    #[tokio::test]
    async fn test_condition_with_variable() {
        let node = ConditionNode;
        let mut ctx = NodeContext::new(Value::Null);
        ctx.set_var("x", serde_json::json!(10));
        let config = serde_json::json!({
            "expression": "x > 5",
            "true_branch": "a",
            "false_branch": "b"
        });
        let result = node.execute(&mut ctx, config).await.unwrap();
        match result {
            NodeOutput::Route(target) => assert_eq!(target, "a"),
            _ => panic!("Expected Route"),
        }
    }

    #[tokio::test]
    async fn test_expr_string_contains() {
        let node = ConditionNode;
        let mut ctx = NodeContext::new(Value::Null);
        ctx.set_var("msg", serde_json::json!("hello world"));
        let config = serde_json::json!({
            "expression": "contains(msg, \"world\")",
            "true_branch": "yes",
        });
        let result = node.execute(&mut ctx, config).await.unwrap();
        match result {
            NodeOutput::Route(target) => assert_eq!(target, "yes"),
            _ => panic!("Expected Route to yes"),
        }
    }

    #[tokio::test]
    async fn test_expr_matches_regex() {
        let node = ConditionNode;
        let mut ctx = NodeContext::new(Value::Null);
        ctx.set_var("email", serde_json::json!("user@example.com"));
        let config = serde_json::json!({
            "expression": "matches(email, \".*@.*\\\\.com\")",
            "true_branch": "valid",
        });
        let result = node.execute(&mut ctx, config).await.unwrap();
        match result {
            NodeOutput::Route(target) => assert_eq!(target, "valid"),
            _ => panic!("Expected Route to valid"),
        }
    }

    #[tokio::test]
    async fn test_expr_in_collection() {
        let node = ConditionNode;
        let mut ctx = NodeContext::new(Value::Null);
        ctx.set_var("status", serde_json::json!("active"));
        ctx.set_var("allowed", serde_json::json!(["active", "pending"]));
        let config = serde_json::json!({
            "expression": "in_(status, allowed)",
            "true_branch": "yes",
        });
        let result = node.execute(&mut ctx, config).await.unwrap();
        match result {
            NodeOutput::Route(target) => assert_eq!(target, "yes"),
            _ => panic!("Expected Route to yes"),
        }
    }

    #[tokio::test]
    async fn test_empty_expression_continues() {
        let node = ConditionNode;
        let mut ctx = NodeContext::new(Value::Null);
        let config = serde_json::json!({"expression": ""});
        let result = node.execute(&mut ctx, config).await.unwrap();
        assert!(matches!(result, NodeOutput::Continue));
    }

    #[tokio::test]
    async fn test_validate_empty_expr_ok() {
        let node = ConditionNode;
        let config = serde_json::json!({"expression": ""});
        assert!(node.validate_config(&config).is_ok());
    }
}
