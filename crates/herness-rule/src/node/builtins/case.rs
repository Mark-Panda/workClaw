use async_trait::async_trait;
use serde_json::Value;

use crate::node::traits::{NodeContext, NodeHandler, NodeOutput};
use herness_common::error::AppResult;

/// Case node evaluates a condition and sets __case_matched in the context.
/// The SwitchNode parent reads this to decide which branch to take.
pub struct CaseNode;

#[async_trait]
impl NodeHandler for CaseNode {
    fn node_type(&self) -> &'static str {
        "case"
    }

    async fn execute(&self, ctx: &mut NodeContext, config: Value) -> AppResult<NodeOutput> {
        let condition = config
            .get("condition")
            .and_then(|v| v.as_str())
            .unwrap_or("");

        let matched = if condition.is_empty() {
            // Empty condition = always match (default case)
            true
        } else {
            // Evaluate condition using the expression engine
            evaluate_condition(condition, ctx)?
        };

        ctx.set_var("__case_matched", Value::Bool(matched));

        if matched {
            Ok(NodeOutput::Continue)
        } else {
            // Skip this branch — return Stop so the engine doesn't continue
            Ok(NodeOutput::Stop)
        }
    }

    fn validate_config(&self, _config: &Value) -> AppResult<()> {
        Ok(())
    }
}

/// Evaluate a condition expression (simple string comparison or boolean)
fn evaluate_condition(condition: &str, ctx: &NodeContext) -> AppResult<bool> {
    // Simple evaluation: check if the condition matches ctx variables
    // Supports patterns like: "var_name == value" or just boolean strings
    let trimmed = condition.trim();

    if trimmed.eq_ignore_ascii_case("true") {
        return Ok(true);
    }
    if trimmed.eq_ignore_ascii_case("false") {
        return Ok(false);
    }

    // Check for "var == value" pattern
    if let Some(eq_pos) = trimmed.find("==") {
        let var_name = trimmed[..eq_pos].trim();
        let expected = trimmed[eq_pos + 2..].trim().trim_matches('"');

        if let Some(val) = ctx.get_var(var_name) {
            let val_str = val
                .as_str()
                .unwrap_or(&val.to_string())
                .to_string();
            return Ok(val_str == expected);
        }
        return Ok(false);
    }

    // Check if the condition is a variable name — truthy check
    if let Some(val) = ctx.get_var(trimmed) {
        return Ok(!val.is_null()
            && !val.as_bool().map(|b| !b).unwrap_or(true)
            && val.as_str().map(|s| !s.is_empty()).unwrap_or(true));
    }

    Ok(false)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[tokio::test]
    async fn test_case_empty_condition() {
        let node = CaseNode;
        let mut ctx = NodeContext::new(Value::Null);
        let config = json!({"condition": ""});
        let result = node.execute(&mut ctx, config).await.unwrap();
        assert!(matches!(result, NodeOutput::Continue));
        assert_eq!(ctx.get_var("__case_matched"), Some(&Value::Bool(true)));
    }

    #[tokio::test]
    async fn test_case_true_condition() {
        let node = CaseNode;
        let mut ctx = NodeContext::new(Value::Null);
        let config = json!({"condition": "true"});
        let result = node.execute(&mut ctx, config).await.unwrap();
        assert!(matches!(result, NodeOutput::Continue));
    }

    #[tokio::test]
    async fn test_case_false_condition() {
        let node = CaseNode;
        let mut ctx = NodeContext::new(Value::Null);
        let config = json!({"condition": "false"});
        let result = node.execute(&mut ctx, config).await.unwrap();
        assert!(matches!(result, NodeOutput::Stop));
    }

    #[tokio::test]
    async fn test_case_var_equals() {
        let node = CaseNode;
        let mut ctx = NodeContext::new(Value::Null);
        ctx.set_var("status", json!("ok"));
        let config = json!({"condition": "status == \"ok\""});
        let result = node.execute(&mut ctx, config).await.unwrap();
        assert!(matches!(result, NodeOutput::Continue));
    }
}
