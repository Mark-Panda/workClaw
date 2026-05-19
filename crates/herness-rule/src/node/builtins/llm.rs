use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::node::traits::{NodeContext, NodeHandler, NodeOutput};
use herness_common::error::{AppError, AppResult};
use herness_core::llm::chat::{ChatCompletionRequest, ChatMessage};
use herness_core::llm::provider::{ChatResponse, LlmProvider};
use herness_core::llm::{AnthropicProvider, OpenAiProvider};

/// Default per-node LLM timeout in seconds
const DEFAULT_LLM_TIMEOUT_SECS: u64 = 60;
/// Default max retries for transient LLM errors
const DEFAULT_MAX_RETRIES: u32 = 2;
/// Retry delay in milliseconds
const RETRY_DELAY_MS: u64 = 500;

/// LLM node configuration
#[derive(Debug, Serialize, Deserialize)]
struct LlmConfig {
    /// Provider type: "anthropic" or "openai"
    #[serde(default = "default_provider")]
    provider: String,
    /// API key env var name (e.g. "ANTHROPIC_API_KEY"). If set, reads from env; if empty, falls back to provider default.
    #[serde(default, rename = "api_key_env")]
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
    /// Per-node timeout in seconds (default: 60)
    #[serde(default = "default_timeout_secs")]
    timeout_secs: u64,
    /// Max retries for transient errors (default: 2)
    #[serde(default = "default_max_retries")]
    max_retries: u32,
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

fn default_timeout_secs() -> u64 {
    DEFAULT_LLM_TIMEOUT_SECS
}

fn default_max_retries() -> u32 {
    DEFAULT_MAX_RETRIES
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

        // Call LLM with per-node timeout and retry
        let response = call_llm_with_retry(&cfg, request).await?;

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

/// Call LLM with per-node timeout and retry logic for transient errors.
async fn call_llm_with_retry(cfg: &LlmConfig, request: ChatCompletionRequest) -> AppResult<ChatResponse> {
    let timeout = std::time::Duration::from_secs(cfg.timeout_secs);
    let max_retries = cfg.max_retries;

    let mut last_error = None;
    for attempt in 0..=max_retries {
        if attempt > 0 {
            tokio::time::sleep(std::time::Duration::from_millis(RETRY_DELAY_MS * attempt as u64)).await;
        }

        match tokio::time::timeout(timeout, call_llm(cfg, &request)).await {
            Ok(Ok(response)) => return Ok(response),
            Ok(Err(e)) => {
                let err_str = e.to_string();
                // Retry on transient errors (rate limit, server error, timeout)
                let is_transient = err_str.contains("429")
                    || err_str.contains("500")
                    || err_str.contains("502")
                    || err_str.contains("503")
                    || err_str.contains("timed out")
                    || err_str.contains("rate limit");
                if is_transient && attempt < max_retries {
                    tracing::warn!(
                        "LLM call attempt {} failed (transient): {}, retrying...",
                        attempt + 1,
                        err_str
                    );
                    last_error = Some(e);
                    continue;
                }
                return Err(e);
            }
            Err(_) => {
                let timeout_err = AppError::RuleExecution(format!(
                    "LLM call timed out after {}s (attempt {}/{})",
                    cfg.timeout_secs,
                    attempt + 1,
                    max_retries + 1
                ));
                if attempt < max_retries {
                    tracing::warn!("{}", timeout_err);
                    last_error = Some(timeout_err);
                    continue;
                }
                return Err(timeout_err);
            }
        }
    }

    Err(last_error.unwrap_or_else(|| AppError::RuleExecution("LLM call failed after retries".into())))
}

/// Call the LLM provider with the given request (no timeout/retry — handled by caller)
async fn call_llm(cfg: &LlmConfig, request: &ChatCompletionRequest) -> AppResult<ChatResponse> {
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
                .chat(request.clone())
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
                .chat(request.clone())
                .await
                .map_err(|e| AppError::RuleExecution(format!("OpenAI API error: {}", e)))
        }
        other => Err(AppError::Validation(format!(
            "llm: unknown provider '{}', expected 'anthropic' or 'openai'",
            other
        ))),
    }
}

/// Resolve API key: use env var name from config, or fall back to provider default env var.
/// Never accept raw API key strings in DSL config to prevent credential leakage.
fn resolve_api_key(config_env: &str, default_env: &str) -> AppResult<String> {
    let env_var = if config_env.is_empty() { default_env } else { config_env };
    std::env::var(env_var).map_err(|_| {
        AppError::Validation(format!(
            "llm: {} env var is not set",
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
        assert_eq!(cfg.timeout_secs, DEFAULT_LLM_TIMEOUT_SECS);
        assert_eq!(cfg.max_retries, DEFAULT_MAX_RETRIES);
    }

    #[test]
    fn test_resolve_api_key_uses_env_var() {
        // This test just verifies the logic — env var may not be set
        let result = resolve_api_key("", "NONEXISTENT_KEY_FOR_TEST");
        assert!(result.is_err());
    }

    #[test]
    fn test_resolve_api_key_custom_env() {
        let result = resolve_api_key("CUSTOM_LLM_KEY", "NONEXISTENT_KEY_FOR_TEST");
        assert!(result.is_err()); // CUSTOM_LLM_KEY not set either
    }
}
