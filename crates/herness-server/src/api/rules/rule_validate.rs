use axum::extract::State;
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::Json;
use serde::Deserialize;
use serde_json::Value;

use herness_rule::dsl::parser;
use herness_rule::dsl::validator;

use super::super::router::AppState;

#[derive(Debug, Deserialize)]
pub struct ValidateRuleRequest {
    pub dsl: Value,
}

pub async fn validate_rule(
    State(state): State<AppState>,
    Json(req): Json<ValidateRuleRequest>,
) -> impl IntoResponse {
    let dsl_json = match serde_json::to_string(&req.dsl) {
        Ok(s) => s,
        Err(e) => {
            return (
                StatusCode::OK,
                Json(serde_json::json!({
                    "valid": false,
                    "warnings": [],
                    "errors": [format!("Invalid JSON: {}", e)]
                })),
            );
        }
    };

    let chain = match parser::parse(&dsl_json) {
        Ok(c) => c,
        Err(e) => {
            return (
                StatusCode::OK,
                Json(serde_json::json!({
                    "valid": false,
                    "warnings": [],
                    "errors": [e.to_string()]
                })),
            );
        }
    };

    let warnings = validator::validate(&chain).unwrap_or_default();

    let mut errors: Vec<String> = Vec::new();
    for node in &chain.nodes {
        if !state.rule_engine.node_registry().contains(&node.node_type) {
            errors.push(format!(
                "Unknown node type '{}' at node '{}'",
                node.node_type, node.id
            ));
        }
    }

    for ic in &chain.interceptor_configs {
        if !state
            .rule_engine
            .interceptor_registry()
            .contains(&ic.interceptor_type)
        {
            errors.push(format!(
                "Unknown interceptor type '{}'",
                ic.interceptor_type
            ));
        }
    }

    let valid = errors.is_empty();

    (
        StatusCode::OK,
        Json(serde_json::json!({
            "valid": valid,
            "warnings": warnings,
            "errors": errors
        })),
    )
}
