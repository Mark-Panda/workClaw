use async_trait::async_trait;
use cel_interpreter::{Context as CelContext, Program, Value as CelValue};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::sync::Arc;

use crate::node::traits::{NodeContext, NodeHandler, NodeOutput};
use herness_common::error::{AppError, AppResult};

#[derive(Debug, Serialize, Deserialize)]
struct ConditionConfig {
    expression: String,
    true_branch: String,
    false_branch: String,
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

        let result = self.evaluate_expression(&cfg.expression, ctx)?;

        if result {
            Ok(NodeOutput::Route(cfg.true_branch))
        } else {
            Ok(NodeOutput::Route(cfg.false_branch))
        }
    }

    fn validate_config(&self, config: &Value) -> AppResult<()> {
        let expr = config
            .get("expression")
            .and_then(|v| v.as_str())
            .unwrap_or("");
        if expr.trim().is_empty() {
            return Err(AppError::Validation("expression must not be empty".into()));
        }
        Ok(())
    }
}

impl ConditionNode {
    fn evaluate_expression(&self, expr: &str, ctx: &NodeContext) -> AppResult<bool> {
        let program = Program::compile(expr)
            .map_err(|e| AppError::RuleExecution(format!("CEL compile error: {}", e)))?;

        let mut cel_ctx = CelContext::default();
        for (key, value) in &ctx.variables {
            if let Some(cel_val) = serde_to_cel(value) {
                cel_ctx.add_variable_from_value(key.clone(), cel_val);
            }
        }
        if let Some(input_val) = serde_to_cel(&ctx.input) {
            cel_ctx.add_variable_from_value("input", input_val);
        }

        let result = program
            .execute(&cel_ctx)
            .map_err(|e| AppError::RuleExecution(format!("CEL eval error: {}", e)))?;

        match result {
            CelValue::Bool(b) => Ok(b),
            _ => Ok(false),
        }
    }
}

fn serde_to_cel(value: &Value) -> Option<CelValue> {
    match value {
        Value::Null => Some(CelValue::Null),
        Value::Bool(b) => Some(CelValue::Bool(*b)),
        Value::Number(n) => {
            if let Some(i) = n.as_i64() {
                Some(CelValue::Int(i))
            } else if let Some(f) = n.as_f64() {
                Some(CelValue::Float(f))
            } else {
                None
            }
        }
        Value::String(s) => Some(CelValue::String(Arc::new(s.clone()))),
        Value::Array(arr) => {
            let items: Vec<CelValue> = arr.iter().filter_map(serde_to_cel).collect();
            Some(CelValue::List(Arc::new(items)))
        }
        Value::Object(_obj) => {
            // CEL Maps require specific Key types, skip objects for simplicity
            None
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
            "expression": "true",
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
            "expression": "false",
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
}
