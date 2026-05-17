use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::node::traits::{NodeContext, NodeHandler, NodeOutput};
use herness_common::error::{AppError, AppResult};
use herness_core::llm::chat::{ChatCompletionRequest, ChatMessage};
use herness_core::llm::provider::{ChatResponse, LlmProvider};
use herness_core::llm::{AnthropicProvider, OpenAiProvider};

/// LLM node configuration
#[derive(Debug, Serialize, Deserialize)]
struct LlmConfig {
    /// Provider type: "anthropic" or "openai"
    #[serde(default = "default_provider")]
    provider: String,
    /// API key (if empty, reads from env var)
    #[serde(default)]
    api_key: String,
    /// Base URL for the API (optional, for proxies)
    #[serde(default)]
    base_url: String,
    /// Model name (e.g. "claude-sonnet-4-6", "gpt-4o")
    model: String,
    /// Prompt template — supports {{var_name}} interpolation from context
    #[serde(default)]
    prompt: String,
    /// System message (optional)
    #[serde(default)]
    system_prompt: String,
    /// Temperature (0.0 — 2.0)
    #[serde(default = "default_temperature")]
    temperature: f64,
    /// Max tokens in response
    #[serde(default = "default_max_tokens")]
    max_tokens: u32,
    /// Context variable name to store the response text
    #[serde(default = "default_output_var")]
    output_var: String,
}

fn default_provider() -> String {
    "openai".into()
}

fn default_temperature() -> f64 {
    0.7
}

fn default_max_tokens() -> u32 {
    1024
}

fn default_output_var() -> String {
    "llm_response".into()
}

pub struct LlmNode;

#[async_trait]
impl NodeHandler for LlmNode {
    fn node_type(&self) -> &'static str {
        "llm"
    }

    async fn execute(&self, ctx: &mut NodeContext, config: Value) -> AppResult<NodeOutput> {
        let cfg: LlmConfig =
            serde_json::from_value(config).map_err(|e| AppError::Validation(e.to_string()))?;

        if cfg.model.is_empty() {
            return Err(AppError::Validation("llm: model must not be empty".into()));
        }

        // Interpolate prompt with context variables
        let prompt = interpolate_template(&cfg.prompt, ctx);

        // Build messages
        let mut messages = Vec::new();

        if !cfg.system_prompt.is_empty() {
            let system = interpolate_template(&cfg.system_prompt, ctx);
            messages.push(ChatMessage::system(&system));
        }

        if prompt.is_empty() {
            return Err(AppError::Validation("llm: prompt must not be empty".into()));
        }
        messages.push(ChatMessage::user(&prompt));

        // Build request
        let request = ChatCompletionRequest {
            model: cfg.model.clone(),
            messages,
            temperature: Some(cfg.temperature),
            max_tokens: Some(cfg.max_tokens),
            tools: None,
        };

        // Create provider and call LLM
        let response = call_llm(&cfg, request).await?;

        // Store response in context
        ctx.set_var(&cfg.output_var, Value::String(response.text));

        Ok(NodeOutput::Continue)
    }

    fn validate_config(&self, config: &Value) -> AppResult<()> {
        let model = config
            .get("model")
            .and_then(|v| v.as_str())
            .unwrap_or("");
        if model.trim().is_empty() {
            return Err(AppError::Validation(
                "llm: model configuration is required".into(),
            ));
        }
        Ok(())
    }
}

/// Call the LLM provider with the given request
async fn call_llm(cfg: &LlmConfig, request: ChatCompletionRequest) -> AppResult<ChatResponse> {
    match cfg.provider.as_str() {
        "anthropic" => {
            let api_key = resolve_api_key(&cfg.api_key, "ANTHROPIC_API_KEY")?;
            let provider = if cfg.base_url.is_empty() {
                AnthropicProvider::new(api_key)
            } else {
                AnthropicProvider::new(api_key)
                    .with_base_url(cfg.base_url.clone())
                    .map_err(|e| AppError::RuleExecution(format!("Invalid Anthropic base_url: {}", e)))?
            };
            provider
                .chat(request)
                .await
                .map_err(|e| AppError::RuleExecution(format!("Anthropic API error: {}", e)))
        }
        "openai" => {
            let api_key = resolve_api_key(&cfg.api_key, "OPENAI_API_KEY")?;
            let provider = if cfg.base_url.is_empty() {
                OpenAiProvider::new(api_key)
            } else {
                OpenAiProvider::new(api_key).with_base_url(cfg.base_url.clone())
            };
            provider
                .chat(request)
                .await
                .map_err(|e| AppError::RuleExecution(format!("OpenAI API error: {}", e)))
        }
        other => Err(AppError::Validation(format!(
            "llm: unknown provider '{}', expected 'anthropic' or 'openai'",
            other
        ))),
    }
}

/// Resolve API key: use explicit key from config, or fall back to env var
fn resolve_api_key(config_key: &str, env_var: &str) -> AppResult<String> {
    if !config_key.is_empty() {
        return Ok(config_key.to_string());
    }
    std::env::var(env_var).map_err(|_| {
        AppError::Validation(format!(
            "llm: no API key provided in config and {} env var is not set",
            env_var
        ))
    })
}

/// Interpolate {{var_name}} placeholders with context variable values
fn interpolate_template(template: &str, ctx: &NodeContext) -> String {
    let mut result = template.to_string();
    // Find all {{...}} patterns
    let re = regex::Regex::new(r"\{\{(\w+)\}\}").ok();
    let re = match re {
        Some(r) => r,
        None => return result,
    };

    for caps in re.captures_iter(template) {
        let var_name = caps.get(1).unwrap().as_str();
        let placeholder = format!("{{{{{}}}}}", var_name);

        let value = ctx
            .get_var(var_name)
            .and_then(|v| {
                if let Some(s) = v.as_str() {
                    Some(s.to_string())
                } else {
                    Some(v.to_string())
                }
            })
            .unwrap_or_default();

        result = result.replace(&placeholder, &value);
    }

    result
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[tokio::test]
    async fn test_llm_requires_model() {
        let node = LlmNode;
        let result = node.validate_config(&json!({"model": ""}));
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_llm_valid_config() {
        let node = LlmNode;
        let result = node.validate_config(&json!({"model": "gpt-4o"}));
        assert!(result.is_ok());
    }

    #[tokio::test]
    async fn test_interpolate_template() {
        let mut ctx = NodeContext::new(Value::Null);
        ctx.set_var("name", json!("World"));
        ctx.set_var("count", json!(42));

        let result = interpolate_template("Hello {{name}}, count = {{count}}", &ctx);
        assert_eq!(result, "Hello World, count = 42");
    }

    #[tokio::test]
    async fn test_interpolate_missing_var() {
        let ctx = NodeContext::new(Value::Null);
        let result = interpolate_template("Hello {{missing}}", &ctx);
        assert_eq!(result, "Hello ");
    }

    #[tokio::test]
    async fn test_llm_default_output_var() {
        let cfg: LlmConfig = serde_json::from_value(json!({
            "model": "gpt-4o",
            "prompt": "hello"
        }))
        .unwrap();
        assert_eq!(cfg.output_var, "llm_response");
        assert_eq!(cfg.temperature, 0.7);
        assert_eq!(cfg.max_tokens, 1024);
        assert_eq!(cfg.provider, "openai");
    }
}
