use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatCompletionRequest {
    pub model: String,
    pub messages: Vec<ChatMessage>,
    pub temperature: Option<f64>,
    pub max_tokens: Option<u32>,
    pub tools: Option<Vec<serde_json::Value>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatMessage {
    pub role: String,
    pub content: MessageContent,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(untagged)]
pub enum MessageContent {
    /// Plain text message
    Text(String),
    /// Multimodal content (text + images)
    MultiPart(Vec<ContentPart>),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum ContentPart {
    #[serde(rename = "text")]
    Text { text: String },
    #[serde(rename = "image_url")]
    ImageUrl {
        image_url: ImageUrl,
    },
    /// Anthropic-style base64 image
    #[serde(rename = "image")]
    Image {
        source: ImageSource,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImageUrl {
    pub url: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub detail: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImageSource {
    #[serde(rename = "type")]
    pub source_type: String,
    pub media_type: String,
    pub data: String,
}

impl ChatMessage {
    pub fn user(text: impl Into<String>) -> Self {
        Self {
            role: "user".into(),
            content: MessageContent::Text(text.into()),
        }
    }

    pub fn assistant(text: impl Into<String>) -> Self {
        Self {
            role: "assistant".into(),
            content: MessageContent::Text(text.into()),
        }
    }

    pub fn system(text: impl Into<String>) -> Self {
        Self {
            role: "system".into(),
            content: MessageContent::Text(text.into()),
        }
    }

    /// Create a user message with text and an image URL
    pub fn user_with_image(text: impl Into<String>, image_url: impl Into<String>) -> Self {
        Self {
            role: "user".into(),
            content: MessageContent::MultiPart(vec![
                ContentPart::Text {
                    text: text.into(),
                },
                ContentPart::ImageUrl {
                    image_url: ImageUrl {
                        url: image_url.into(),
                        detail: None,
                    },
                },
            ]),
        }
    }

    /// Create a user message with text and a base64-encoded image
    pub fn user_with_base64_image(
        text: impl Into<String>,
        media_type: impl Into<String>,
        base64_data: impl Into<String>,
    ) -> Self {
        Self {
            role: "user".into(),
            content: MessageContent::MultiPart(vec![
                ContentPart::Text {
                    text: text.into(),
                },
                ContentPart::Image {
                    source: ImageSource {
                        source_type: "base64".into(),
                        media_type: media_type.into(),
                        data: base64_data.into(),
                    },
                },
            ]),
        }
    }

    /// Get the text content of this message (first text part)
    pub fn text_content(&self) -> String {
        match &self.content {
            MessageContent::Text(t) => t.clone(),
            MessageContent::MultiPart(parts) => parts
                .iter()
                .filter_map(|p| match p {
                    ContentPart::Text { text } => Some(text.clone()),
                    _ => None,
                })
                .collect::<Vec<_>>()
                .join(""),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_text_message() {
        let msg = ChatMessage::user("Hello");
        assert_eq!(msg.role, "user");
        assert_eq!(msg.text_content(), "Hello");
    }

    #[test]
    fn test_multimodal_message() {
        let msg = ChatMessage::user_with_image("What's in this image?", "https://example.com/img.jpg");
        assert_eq!(msg.role, "user");
        assert_eq!(msg.text_content(), "What's in this image?");
    }

    #[test]
    fn test_base64_image_message() {
        let msg = ChatMessage::user_with_base64_image("Describe this", "image/png", "abc123");
        assert_eq!(msg.role, "user");
    }

    #[test]
    fn test_system_message() {
        let msg = ChatMessage::system("You are helpful");
        assert_eq!(msg.role, "system");
    }

    #[test]
    fn test_message_content_serialization() {
        let text_msg = ChatMessage::user("Hello");
        let json = serde_json::to_string(&text_msg).unwrap();
        assert!(json.contains("Hello"));

        let multi_msg = ChatMessage::user_with_image("Look", "https://img.com/1.jpg");
        let json = serde_json::to_string(&multi_msg).unwrap();
        assert!(json.contains("image_url"));
    }
}
