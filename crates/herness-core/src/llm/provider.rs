use async_trait::async_trait;
use super::chat::{ChatCompletionRequest, ToolCall};
use super::streaming::StreamEvent;
use futures::stream::Stream;

/// The result of a non-streaming chat completion.
#[derive(Debug, Clone)]
pub struct ChatResponse {
    /// Text content from the model
    pub text: String,
    /// Tool calls the model requested (if any)
    pub tool_calls: Vec<ToolCall>,
}

#[async_trait]
pub trait LlmProvider: Send + Sync {
    /// Send a chat completion request and return the full response.
    async fn chat(&self, request: ChatCompletionRequest) -> anyhow::Result<ChatResponse>;
    /// Send a streaming chat completion request.
    async fn chat_stream(
        &self,
        request: ChatCompletionRequest,
    ) -> anyhow::Result<Box<dyn Stream<Item = anyhow::Result<StreamEvent>> + Send + Unpin>>;
}
