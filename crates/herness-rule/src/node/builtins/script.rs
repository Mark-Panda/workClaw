use async_trait::async_trait;
use rhai::{Dynamic, Engine, Scope};
use serde_json::Value;

use crate::node::traits::{NodeContext, NodeHandler, NodeOutput};
use herness_common::error::{AppError, AppResult};

pub struct ScriptNode;

#[async_trait]
impl NodeHandler for ScriptNode {
    fn node_type(&self) -> &'static str {
        "script"
    }

    async fn execute(&self, ctx: &mut NodeContext, config: Value) -> AppResult<NodeOutput> {
        let script = config
            .get("script")
            .and_then(|v| v.as_str())
            .unwrap_or("");

        if script.trim().is_empty() {
            return Ok(NodeOutput::Continue);
        }

        let engine = Engine::new();
        let mut scope = Scope::new();

        // Push all context variables into scope
        for (key, value) in &ctx.variables {
            let dynamic = serde_to_dynamic(value);
            scope.push_dynamic(key, dynamic);
        }

        // Push input as special variable
        scope.push_dynamic("input", serde_to_dynamic(&ctx.input));

        // Evaluate
        let _result = engine
            .eval_with_scope::<Dynamic>(&mut scope, script)
            .map_err(|e| AppError::RuleExecution(format!("Rhai script error: {}", e)))?;

        // Sync scope variables back to context
        for (key, _is_constant, _value) in scope.iter() {
            if key == "input" {
                continue;
            }
            if let Some(dynamic) = scope.get_value::<Dynamic>(key) {
                let json_val = dynamic_to_serde(&dynamic);
                ctx.set_var(key, json_val);
            }
        }

        Ok(NodeOutput::Continue)
    }
}

fn serde_to_dynamic(value: &Value) -> Dynamic {
    match value {
        Value::Null => Dynamic::UNIT,
        Value::Bool(b) => Dynamic::from_bool(*b),
        Value::Number(n) => {
            if let Some(i) = n.as_i64() {
                Dynamic::from_int(i)
            } else if let Some(f) = n.as_f64() {
                Dynamic::from_float(f)
            } else {
                Dynamic::UNIT
            }
        }
        Value::String(s) => Dynamic::from(s.clone()),
        Value::Array(arr) => {
            let items: Vec<Dynamic> = arr.iter().map(serde_to_dynamic).collect();
            Dynamic::from_array(items)
        }
        Value::Object(obj) => {
            let mut map = rhai::Map::new();
            for (k, v) in obj {
                map.insert(k.clone().into(), serde_to_dynamic(v));
            }
            Dynamic::from_map(map)
        }
    }
}

fn dynamic_to_serde(value: &Dynamic) -> Value {
    if value.is_unit() {
        Value::Null
    } else if value.is_bool() {
        Value::Bool(value.as_bool().unwrap_or(false))
    } else if value.is_int() {
        Value::Number(serde_json::Number::from(value.as_int().unwrap_or(0)))
    } else if value.is_float() {
        value
            .as_float()
            .ok()
            .and_then(|f| serde_json::Number::from_f64(f))
            .map(Value::Number)
            .unwrap_or(Value::Null)
    } else if value.is_string() {
        Value::String(value.to_string())
    } else if value.is_array() {
        if let Ok(arr) = value.clone().into_array() {
            let items: Vec<Value> = arr.iter().map(dynamic_to_serde).collect();
            Value::Array(items)
        } else {
            Value::Null
        }
    } else if value.is_map() {
        let map_str = value.to_string();
        Value::String(map_str)
    } else {
        Value::String(value.to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_script_node_empty_script() {
        let node = ScriptNode;
        let mut ctx = NodeContext::new(Value::Null);
        let config = serde_json::json!({});
        let result = node.execute(&mut ctx, config).await.unwrap();
        match result {
            NodeOutput::Continue => {}
            _ => panic!("Expected Continue"),
        }
    }

    #[tokio::test]
    async fn test_script_node_sets_variable() {
        let node = ScriptNode;
        let mut ctx = NodeContext::new(Value::Null);
        let config = serde_json::json!({"script": "let result = 42;"});
        let result = node.execute(&mut ctx, config).await.unwrap();
        match result {
            NodeOutput::Continue => {
                assert_eq!(ctx.get_var("result"), Some(&Value::Number(42.into())));
            }
            _ => panic!("Expected Continue"),
        }
    }

    #[tokio::test]
    async fn test_script_node_accesses_input() {
        let node = ScriptNode;
        let mut ctx = NodeContext::new(serde_json::json!({"x": 10}));
        let config = serde_json::json!({"script": "let sum = input.x + 5;"});
        let result = node.execute(&mut ctx, config).await.unwrap();
        match result {
            NodeOutput::Continue => {
                assert_eq!(ctx.get_var("sum"), Some(&Value::Number(15.into())));
            }
            _ => panic!("Expected Continue"),
        }
    }
}
