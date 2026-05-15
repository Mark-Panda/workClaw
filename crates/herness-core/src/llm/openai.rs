use async_openai::types::chat::{
    ChatCompletionRequestAssistantMessage, ChatCompletionRequestAssistantMessageContent,
    ChatCompletionRequestMessage, ChatCompletionRequestMessageContentPartImage,
    ChatCompletionRequestMessageContentPartText, ChatCompletionRequestSystemMessage,
    ChatCompletionRequestSystemMessageContent, ChatCompletionRequestToolMessage,
    ChatCompletionRequestToolMessageContent, ChatCompletionRequestUserMessage,
    ChatCompletionRequestUserMessageContent, ChatCompletionRequestUserMessageContentPart,
    ChatCompletionTool, ChatCompletionTools, CreateChatCompletionRequestArgs,
    CreateChatCompletionStreamResponse, FinishReason, FunctionObject, ImageDetail, ImageUrl,
};
use async_openai::Client as OaiClient;
use async_trait::async_trait;
use futures::stream::Stream;
use std::pin::Pin;
use std::task::{Context, Poll};

use super::chat::{ChatCompletionRequest, ChatMessage, ContentPart, MessageContent, ToolCall};
use super::provider::{ChatResponse, LlmProvider};
use super::streaming::StreamEvent;

// ── Conversion helpers ────────────────────────────────────

fn convert_message(msg: &ChatMessage) -> ChatCompletionRequestMessage {
    match msg.role.as_str() {
        "system" => {
            ChatCompletionRequestMessage::System(ChatCompletionRequestSystemMessage {
                content: ChatCompletionRequestSystemMessageContent::Text(msg.text_content()),
                name: None,
            })
        }
        "user" => {
            let content = match &msg.content {
                MessageContent::Text(text) => {
                    ChatCompletionRequestUserMessageContent::Text(text.clone())
                }
                MessageContent::MultiPart(parts) => {
                    let array: Vec<ChatCompletionRequestUserMessageContentPart> = parts
                        .iter()
                        .map(|p| match p {
                            ContentPart::Text { text } => {
                                ChatCompletionRequestUserMessageContentPart::Text(
                                    ChatCompletionRequestMessageContentPartText {
                                        text: text.clone(),
                                    },
                                )
                            }
                            ContentPart::ImageUrl { image_url } => {
                                ChatCompletionRequestUserMessageContentPart::ImageUrl(
                                    ChatCompletionRequestMessageContentPartImage {
                                        image_url: ImageUrl {
                                            url: image_url.url.clone(),
                                            detail: image_url
                                                .detail
                                                .as_deref()
                                                .map(|d| match d {
                                                    "low" => ImageDetail::Low,
                                                    "high" => ImageDetail::High,
                                                    "original" => ImageDetail::Original,
                                                    _ => ImageDetail::Auto,
                                                })
                                                .unwrap_or(ImageDetail::Auto)
                                                .into(),
                                        },
                                    },
                                )
                            }
                            ContentPart::Image { source } => {
                                ChatCompletionRequestUserMessageContentPart::ImageUrl(
                                    ChatCompletionRequestMessageContentPartImage {
                                        image_url: ImageUrl {
                                            url: format!(
                                                "data:{};base64,{}",
                                                source.media_type, source.data
                                            ),
                                            detail: Some(ImageDetail::Auto),
                                        },
                                    },
                                )
                            }
                        })
                        .collect();
                    ChatCompletionRequestUserMessageContent::Array(array)
                }
            };
            ChatCompletionRequestMessage::User(ChatCompletionRequestUserMessage {
                content,
                name: None,
            })
        }
        "assistant" => ChatCompletionRequestMessage::Assistant(
            ChatCompletionRequestAssistantMessage {
                content: Some(ChatCompletionRequestAssistantMessageContent::Text(
                    msg.text_content(),
                )),
                name: None,
                tool_calls: None,
                refusal: None,
                audio: None,
                #[allow(deprecated)]
                function_call: None,
            },
        ),
        "tool" => ChatCompletionRequestMessage::Tool(ChatCompletionRequestToolMessage {
            content: ChatCompletionRequestToolMessageContent::Text(msg.text_content()),
            tool_call_id: msg.tool_call_id.clone().unwrap_or_default(),
        }),
        _ => ChatCompletionRequestMessage::User(ChatCompletionRequestUserMessage {
            content: ChatCompletionRequestUserMessageContent::Text(msg.text_content()),
            name: None,
        }),
    }
}

fn convert_tools(request: &ChatCompletionRequest) -> Option<Vec<ChatCompletionTools>> {
    request.tools.as_ref().map(|tools| {
        tools
            .iter()
            .map(|t| {
                ChatCompletionTools::Function(ChatCompletionTool {
                    function: FunctionObject {
                        name: t
                            .get("name")
                            .and_then(|v| v.as_str())
                            .unwrap_or("")
                            .to_string(),
                        description: t
                            .get("description")
                            .and_then(|v| v.as_str())
                            .map(|s| s.to_string()),
                        parameters: t.get("parameters").cloned(),
                        strict: None,
                    },
                })
            })
            .collect()
    })
}

// ── Stream wrapper ────────────────────────────────────────

/// Wraps async-openai's stream and converts events to our StreamEvent.
struct OpenAiStreamWrapper {
    inner: Pin<
        Box<
            dyn Stream<Item = Result<CreateChatCompletionStreamResponse, async_openai::error::OpenAIError>>
                + Send
                + Unpin,
        >,
    >,
    done: bool,
}

impl Stream for OpenAiStreamWrapper {
    type Item = anyhow::Result<StreamEvent>;

    fn poll_next(mut self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<Option<Self::Item>> {
        if self.done {
            return Poll::Ready(None);
        }

        loop {
            match self.inner.as_mut().poll_next(cx) {
                Poll::Ready(Some(Ok(chunk))) => {
                    if let Some(choice) = chunk.choices.first() {
                        if let Some(tool_calls) = &choice.delta.tool_calls {
                            for tc in tool_calls {
                                if let Some(func) = &tc.function {
                                    return Poll::Ready(Some(Ok(StreamEvent::ToolCall {
                                        id: tc.id.clone().unwrap_or_default(),
                                        name: func.name.clone().unwrap_or_default(),
                                        arguments: func.arguments.clone().unwrap_or_default(),
                                    })));
                                }
                            }
                        }

                        if let Some(reason) = &choice.finish_reason {
                            self.done = true;
                            return Poll::Ready(Some(Ok(StreamEvent::Done {
                                finish_reason: Some(finish_reason_to_str(reason)),
                            })));
                        }

                        if let Some(content) = &choice.delta.content {
                            if !content.is_empty() {
                                return Poll::Ready(Some(Ok(StreamEvent::Text {
                                    content: content.clone(),
                                })));
                            }
                        }
                    }
                    // Empty chunk — loop again to poll for more data
                }
                Poll::Ready(Some(Err(e))) => {
                    return Poll::Ready(Some(Err(anyhow::anyhow!(
                        "OpenAI stream error: {}",
                        e
                    ))))
                }
                Poll::Ready(None) => return Poll::Ready(None),
                Poll::Pending => return Poll::Pending,
            }
        }
    }
}

fn finish_reason_to_str(reason: &FinishReason) -> String {
    match reason {
        FinishReason::Stop => "stop",
        FinishReason::Length => "length",
        FinishReason::ToolCalls => "tool_calls",
        FinishReason::ContentFilter => "content_filter",
        FinishReason::FunctionCall => "function_call",
    }
    .to_string()
}

// ── Provider ──────────────────────────────────────────────

pub struct OpenAiProvider {
    client: OaiClient<async_openai::config::OpenAIConfig>,
    api_key: String,
}

impl OpenAiProvider {
    pub fn new(api_key: String) -> Self {
        let config =
            async_openai::config::OpenAIConfig::new().with_api_key(api_key.clone());
        Self {
            client: OaiClient::with_config(config),
            api_key,
        }
    }

    pub fn with_base_url(mut self, base_url: String) -> Self {
        let config = async_openai::config::OpenAIConfig::new()
            .with_api_key(self.api_key.clone())
            .with_api_base(base_url);
        self.client = OaiClient::with_config(config);
        self
    }
}

#[async_trait]
impl LlmProvider for OpenAiProvider {
    async fn chat(&self, request: ChatCompletionRequest) -> anyhow::Result<ChatResponse> {
        let messages: Vec<ChatCompletionRequestMessage> =
            request.messages.iter().map(convert_message).collect();

        let mut req_args = CreateChatCompletionRequestArgs::default();
        req_args.model(&request.model).messages(messages);
        if let Some(temp) = request.temperature {
            req_args.temperature(temp as f32);
        }
        if let Some(max_tok) = request.max_tokens {
            req_args.max_completion_tokens(max_tok);
        }
        if let Some(tools) = convert_tools(&request) {
            req_args.tools(tools);
        }

        let req = req_args.build()?;
        let response = self.client.chat().create(req).await?;

        let choice = response.choices.into_iter().next();
        let text = choice
            .as_ref()
            .and_then(|c| c.message.content.clone())
            .unwrap_or_default();

        let tool_calls: Vec<ToolCall> = choice
            .and_then(|c| c.message.tool_calls)
            .unwrap_or_default()
            .into_iter()
            .filter_map(|tc| match tc {
                async_openai::types::chat::ChatCompletionMessageToolCalls::Function(f) => {
                    Some(ToolCall {
                        id: f.id,
                        name: f.function.name,
                        arguments: f.function.arguments,
                    })
                }
                _ => None,
            })
            .collect();

        Ok(ChatResponse { text, tool_calls })
    }

    async fn chat_stream(
        &self,
        request: ChatCompletionRequest,
    ) -> anyhow::Result<Box<dyn Stream<Item = anyhow::Result<StreamEvent>> + Send + Unpin>> {
        let messages: Vec<ChatCompletionRequestMessage> =
            request.messages.iter().map(convert_message).collect();

        let mut req_args = CreateChatCompletionRequestArgs::default();
        req_args.model(&request.model).messages(messages).stream(true);
        if let Some(temp) = request.temperature {
            req_args.temperature(temp as f32);
        }
        if let Some(max_tok) = request.max_tokens {
            req_args.max_completion_tokens(max_tok);
        }
        if let Some(tools) = convert_tools(&request) {
            req_args.tools(tools);
        }

        let req = req_args.build()?;
        let stream = self.client.chat().create_stream(req).await?;

        Ok(Box::new(OpenAiStreamWrapper {
            inner: Box::pin(stream),
            done: false,
        }))
    }
}

// ── Tests ─────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    fn make_text_request() -> ChatCompletionRequest {
        ChatCompletionRequest {
            model: "gpt-4o".into(),
            messages: vec![ChatMessage::user("Hello")],
            temperature: Some(0.7),
            max_tokens: Some(100),
            tools: None,
        }
    }

    #[tokio::test]
    async fn test_openai_provider_construction() {
        let _provider = OpenAiProvider::new("test-key".into());
        let _custom = OpenAiProvider::new("test-key".into())
            .with_base_url("https://custom.api.com/v1".into());
    }

    #[tokio::test]
    async fn test_openai_chat_network_error_on_invalid_key() {
        let provider = OpenAiProvider::new("invalid-key".into());
        let result = provider.chat(make_text_request()).await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_openai_text_message_serialization() {
        let msg = ChatMessage::user("Hello");
        let cm = convert_message(&msg);
        match cm {
            ChatCompletionRequestMessage::User(m) => match m.content {
                ChatCompletionRequestUserMessageContent::Text(t) => assert_eq!(t, "Hello"),
                _ => panic!("Expected text content"),
            },
            _ => panic!("Expected user message"),
        }
    }

    #[tokio::test]
    async fn test_openai_multimodal_message_serialization() {
        let msg = ChatMessage::user_with_image("What's this?", "https://example.com/img.jpg");
        let cm = convert_message(&msg);
        match cm {
            ChatCompletionRequestMessage::User(m) => match m.content {
                ChatCompletionRequestUserMessageContent::Array(parts) => {
                    assert_eq!(parts.len(), 2);
                    match &parts[1] {
                        ChatCompletionRequestUserMessageContentPart::ImageUrl(img) => {
                            assert_eq!(img.image_url.url, "https://example.com/img.jpg");
                        }
                        _ => panic!("Expected image part"),
                    }
                }
                _ => panic!("Expected array content"),
            },
            _ => panic!("Expected user message"),
        }
    }

    #[tokio::test]
    async fn test_openai_base64_image_message_serialization() {
        let msg = ChatMessage::user_with_base64_image("Describe", "image/png", "abc123");
        let cm = convert_message(&msg);
        match cm {
            ChatCompletionRequestMessage::User(m) => match m.content {
                ChatCompletionRequestUserMessageContent::Array(parts) => {
                    let url = match &parts[1] {
                        ChatCompletionRequestUserMessageContentPart::ImageUrl(img) => {
                            img.image_url.url.clone()
                        }
                        _ => panic!("Expected image part"),
                    };
                    assert!(url.starts_with("data:image/png;base64,abc123"));
                }
                _ => panic!("Expected array content"),
            },
            _ => panic!("Expected user message"),
        }
    }
}
