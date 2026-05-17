use async_trait::async_trait;
use rhai::{Engine, Scope};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::sync::OnceLock;

use crate::node::traits::{NodeContext, NodeHandler, NodeOutput};
use herness_common::error::{AppError, AppResult};

/// IF node configuration
#[derive(Debug, Serialize, Deserialize)]
struct IfConfig {
    /// Rhai expression to evaluate
    expression: String,
    /// Node ID for the true branch
    #[serde(default)]
    true_branch: Option<String>,
    /// Node ID for the false branch
    #[serde(default)]
    false_branch: Option<String>,
}

pub struct IfNode;

#[async_trait]
impl NodeHandler for IfNode {
    fn node_type(&self) -> &'static str {
        "if"
    }

    async fn execute(&self, ctx: &mut NodeContext, config: Value) -> AppResult<NodeOutput> {
        let cfg: IfConfig =
            serde_json::from_value(config).map_err(|e| AppError::Validation(e.to_string()))?;

        let result = eval_if_expression(&cfg.expression, ctx)?;

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
        let engine = get_if_engine();
        engine
            .compile_expression(expr)
            .map_err(|e| AppError::Validation(format!("If expression compile error: {}", e)))?;
        Ok(())
    }
}

fn get_if_engine() -> &'static Engine {
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

fn eval_if_expression(expr: &str, ctx: &NodeContext) -> AppResult<bool> {
    if expr.trim().is_empty() {
        return Ok(true);
    }

    let engine = get_if_engine();
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
        .map_err(|e| AppError::RuleExecution(format!("If expression eval error: {}", e)))?;

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
    async fn test_if_true_routes_to_true_branch() {
        let node = IfNode;
        let mut ctx = NodeContext::new(Value::Null);
        let config = serde_json::json!({
            "expression": "1 == 1",
            "true_branch": "node_true",
        });
        let result = node.execute(&mut ctx, config).await.unwrap();
        match result {
            NodeOutput::Route(target) => assert_eq!(target, "node_true"),
            _ => panic!("Expected Route"),
        }
    }

    #[tokio::test]
    async fn test_if_false_routes_to_false_branch() {
        let node = IfNode;
        let mut ctx = NodeContext::new(Value::Null);
        let config = serde_json::json!({
            "expression": "1 == 0",
            "false_branch": "node_false",
        });
        let result = node.execute(&mut ctx, config).await.unwrap();
        match result {
            NodeOutput::Route(target) => assert_eq!(target, "node_false"),
            _ => panic!("Expected Route"),
        }
    }

    #[tokio::test]
    async fn test_if_empty_expr_continues() {
        let node = IfNode;
        let mut ctx = NodeContext::new(Value::Null);
        let config = serde_json::json!({"expression": ""});
        let result = node.execute(&mut ctx, config).await.unwrap();
        assert!(matches!(result, NodeOutput::Continue));
    }
}
