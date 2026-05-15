use async_trait::async_trait;
use claude_api::messages::content::ContentBlock;
use claude_api::messages::content::KnownBlock;
use claude_api::messages::input::MessageContent;
use claude_api::messages::stream::ContentDelta;
use claude_api::messages::stream::KnownContentDelta;
use claude_api::messages::stream::KnownStreamEvent;
use claude_api::messages::CreateMessageRequest;
use claude_api::messages::CustomTool;
use claude_api::messages::Tool;
use claude_api::types::ModelId;
use claude_api::Client as ClaudeClient;
use futures::StreamExt;
use tokio_stream::wrappers::ReceiverStream;

use super::chat::ChatCompletionRequest;
use super::chat::ChatMessage;
use super::chat::ContentPart;
use super::chat::MessageContent as OurMC;
use super::provider::LlmProvider;
use super::streaming::StreamEvent;

// ── Conversion helpers ────────────────────────────────────

fn convert_content(msg: &ChatMessage) -> MessageContent {
    match &msg.content {
        OurMC::Text(text) => MessageContent::Text(text.clone()),
        OurMC::MultiPart(parts) => {
            let blocks: Vec<ContentBlock> = parts
                .iter()
                .map(|p| match p {
                    ContentPart::Text { text } => ContentBlock::text(text),
                    ContentPart::ImageUrl { image_url } => {
                        ContentBlock::image_url(&image_url.url)
                    }
                    ContentPart::Image { source } => {
                        ContentBlock::image_base64(&source.media_type, &source.data)
                    }
                })
                .collect();
            MessageContent::from(blocks)
        }
    }
}

fn convert_tools(request: &ChatCompletionRequest) -> Vec<Tool> {
    match &request.tools {
        Some(tools) => tools
            .iter()
            .map(|t| {
                let name = t.get("name").and_then(|v| v.as_str()).unwrap_or("");
                let desc = t.get("description").and_then(|v| v.as_str());
                let params = t.get("parameters").cloned().unwrap_or_default();
                let mut ct = CustomTool::new(name, params);
                if let Some(d) = desc {
                    ct = ct.description(d);
                }
                Tool::Custom(ct)
            })
            .collect(),
        None => Vec::new(),
    }
}

fn build_request(request: &ChatCompletionRequest) -> anyhow::Result<CreateMessageRequest> {
    let mut builder = CreateMessageRequest::builder()
        .model(ModelId::custom(&request.model))
        .max_tokens(request.max_tokens.unwrap_or(4096));

    // The Anthropic API uses a dedicated system field rather than a
    // "system" role in the message list.  Separate them out.
    let mut system_texts = Vec::new();
    for msg in &request.messages {
        match msg.role.as_str() {
            "system" => system_texts.push(msg.text_content()),
            "user" => builder = builder.user(convert_content(msg)),
            "assistant" => builder = builder.assistant(convert_content(msg)),
            _ => builder = builder.user(convert_content(msg)),
        }
    }

    if !system_texts.is_empty() {
        builder = builder.system(system_texts.join("\n\n"));
    }

    if let Some(temp) = request.temperature {
        builder = builder.temperature(temp as f32);
    }

    let tools = convert_tools(request);
    if !tools.is_empty() {
        builder = builder.tools(tools);
    }

    Ok(builder.build()?)
}

// ── Provider ──────────────────────────────────────────────

pub struct AnthropicProvider {
    client: ClaudeClient,
    api_key: String,
    base_url: String,
}

impl AnthropicProvider {
    pub fn new(api_key: String) -> Self {
        Self {
            client: ClaudeClient::new(api_key.clone()),
            api_key,
            base_url: "https://api.anthropic.com".to_string(),
        }
    }

    pub fn with_base_url(mut self, base_url: String) -> Self {
        self.base_url = base_url.clone();
        self.client = ClaudeClient::builder()
            .api_key(&self.api_key)
            .base_url(base_url)
            .build()
            .expect("building Claude client with custom base URL should succeed");
        self
    }
}

#[async_trait]
impl LlmProvider for AnthropicProvider {
    async fn chat(&self, request: ChatCompletionRequest) -> anyhow::Result<String> {
        let req = build_request(&request)?;
        let response = self.client.messages().create(req).await?;

        let text = response
            .content
            .iter()
            .filter_map(|block| match block {
                ContentBlock::Known(KnownBlock::Text { text, .. }) => Some(text.as_str()),
                _ => None,
            })
            .collect::<Vec<_>>()
            .join("");

        Ok(text)
    }

    async fn chat_stream(
        &self,
        request: ChatCompletionRequest,
    ) -> anyhow::Result<
        Box<dyn futures::Stream<Item = anyhow::Result<StreamEvent>> + Send + Unpin>,
    > {
        let req = build_request(&request)?;
        let mut stream = self.client.messages().create_stream(req).await?;

        let (tx, rx) = tokio::sync::mpsc::channel::<anyhow::Result<StreamEvent>>(64);

        tokio::spawn(async move {
            let mut pending_tool_id: Option<String> = None;
            let mut pending_tool_name: Option<String> = None;

            while let Some(event) = stream.next().await {
                match event {
                    Ok(ev) => match ev {
                        claude_api::messages::stream::StreamEvent::Known(known) => {
                            match known {
                                KnownStreamEvent::ContentBlockStart {
                                    content_block, ..
                                } => {
                                    if let ContentBlock::Known(KnownBlock::ToolUse {
                                        id,
                                        name,
                                        ..
                                    }) = content_block
                                    {
                                        pending_tool_id = Some(id.clone());
                                        pending_tool_name = Some(name.clone());
                                        if tx
                                            .send(Ok(StreamEvent::ToolCall {
                                                id,
                                                name,
                                                arguments: String::new(),
                                            }))
                                            .await
                                            .is_err()
                                        {
                                            return;
                                        }
                                    }
                                }
                                KnownStreamEvent::ContentBlockDelta { delta, .. } => match delta {
                                    ContentDelta::Known(KnownContentDelta::TextDelta {
                                        text,
                                    }) => {
                                        if !text.is_empty()
                                            && tx
                                                .send(Ok(StreamEvent::Text {
                                                    content: text,
                                                }))
                                                .await
                                                .is_err()
                                        {
                                            return;
                                        }
                                    }
                                    ContentDelta::Known(
                                        KnownContentDelta::InputJsonDelta {
                                            partial_json,
                                        },
                                    ) => {
                                        if tx
                                            .send(Ok(StreamEvent::ToolCall {
                                                id: pending_tool_id
                                                    .clone()
                                                    .unwrap_or_default(),
                                                name: pending_tool_name
                                                    .clone()
                                                    .unwrap_or_default(),
                                                arguments: partial_json,
                                            }))
                                            .await
                                            .is_err()
                                        {
                                            return;
                                        }
                                    }
                                    _ => {}
                                },
                                KnownStreamEvent::MessageDelta { delta, .. } => {
                                    if let Some(stop_reason) = delta.stop_reason {
                                        if tx
                                            .send(Ok(StreamEvent::Done {
                                                finish_reason: Some(
                                                    stop_reason_to_str(stop_reason),
                                                ),
                                            }))
                                            .await
                                            .is_err()
                                        {
                                            return;
                                        }
                                    }
                                }
                                KnownStreamEvent::MessageStop => {
                                    let _ = tx
                                        .send(Ok(StreamEvent::Done {
                                            finish_reason: Some("end_turn".into()),
                                        }))
                                        .await;
                                    return;
                                }
                                _ => {}
                            }
                        }
                        _ => {} // skip unknown events
                    },
                    Err(e) => {
                        let _ = tx
                            .send(Err(anyhow::anyhow!("Claude stream error: {}", e)))
                            .await;
                        return;
                    }
                }
            }
        });

        Ok(Box::new(ReceiverStream::new(rx)))
    }
}

fn stop_reason_to_str(r: claude_api::types::StopReason) -> String {
    match r {
        claude_api::types::StopReason::EndTurn => "end_turn",
        claude_api::types::StopReason::MaxTokens => "max_tokens",
        claude_api::types::StopReason::StopSequence => "stop_sequence",
        claude_api::types::StopReason::ToolUse => "tool_use",
        claude_api::types::StopReason::PauseTurn => "pause_turn",
        claude_api::types::StopReason::Refusal => "refusal",
        claude_api::types::StopReason::Other => "other",
    }
    .to_string()
}

// ── Tests ─────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    fn make_text_request() -> ChatCompletionRequest {
        ChatCompletionRequest {
            model: "claude-sonnet-4-6".into(),
            messages: vec![ChatMessage::user("Hello")],
            temperature: Some(0.7),
            max_tokens: Some(100),
            tools: None,
        }
    }

    #[tokio::test]
    async fn test_anthropic_provider_construction() {
        let _provider = AnthropicProvider::new("test-key".into());
    }

    #[tokio::test]
    async fn test_anthropic_chat_network_error_on_invalid_key() {
        let provider = AnthropicProvider::new("invalid-key".into());
        let result = provider.chat(make_text_request()).await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_anthropic_text_message_conversion() {
        let msg = ChatMessage::user("Hello");
        let content = convert_content(&msg);
        match content {
            MessageContent::Text(t) => assert_eq!(t, "Hello"),
            _ => panic!("Expected text content"),
        }
    }

    #[tokio::test]
    async fn test_anthropic_multimodal_message_conversion() {
        let msg = ChatMessage::user_with_base64_image("Describe", "image/png", "abc123");
        let content = convert_content(&msg);
        match content {
            MessageContent::Blocks(blocks) => {
                assert_eq!(blocks.len(), 2);
            }
            _ => panic!("Expected blocks content"),
        }
    }

    #[test]
    fn test_stop_reason_conversion() {
        assert_eq!(
            stop_reason_to_str(claude_api::types::StopReason::EndTurn),
            "end_turn"
        );
        assert_eq!(
            stop_reason_to_str(claude_api::types::StopReason::MaxTokens),
            "max_tokens"
        );
        assert_eq!(
            stop_reason_to_str(claude_api::types::StopReason::ToolUse),
            "tool_use"
        );
        assert_eq!(
            stop_reason_to_str(claude_api::types::StopReason::Other),
            "other"
        );
    }
}
