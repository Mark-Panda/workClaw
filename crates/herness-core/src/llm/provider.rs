use async_trait::async_trait;
use super::chat::ChatCompletionRequest;
use super::streaming::StreamEvent;
use futures::stream::Stream;

#[async_trait]
pub trait LlmProvider: Send + Sync {
    async fn chat(&self, request: ChatCompletionRequest) -> anyhow::Result<String>;
    async fn chat_stream(
        &self,
        request: ChatCompletionRequest,
    ) -> anyhow::Result<Box<dyn Stream<Item = anyhow::Result<StreamEvent>> + Send + Unpin>>;
}
