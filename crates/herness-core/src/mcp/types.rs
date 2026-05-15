use serde::{Deserialize, Serialize};

/// An MCP tool definition.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct McpTool {
    pub name: String,
    pub description: String,
    pub input_schema: serde_json::Value,
}

/// An MCP resource definition.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct McpResource {
    pub uri: String,
    pub name: String,
    pub description: Option<String>,
    pub mime_type: Option<String>,
}

/// Result of calling an MCP tool.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolCallResult {
    /// Whether the tool call succeeded
    pub success: bool,
    /// The content returned by the tool
    pub content: Vec<ToolResultContent>,
    /// Whether this is an error result
    #[serde(default)]
    pub is_error: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolResultContent {
    #[serde(rename = "type")]
    pub content_type: String,
    #[serde(default)]
    pub text: Option<String>,
    #[serde(default)]
    pub data: Option<String>,
    #[serde(default)]
    #[serde(rename = "mimeType")]
    pub mime_type: Option<String>,
}

impl ToolCallResult {
    /// Create a successful result with text content.
    pub fn success_text(text: impl Into<String>) -> Self {
        Self {
            success: true,
            is_error: false,
            content: vec![ToolResultContent {
                content_type: "text".into(),
                text: Some(text.into()),
                data: None,
                mime_type: None,
            }],
        }
    }

    /// Create an error result with a message.
    pub fn error(message: impl Into<String>) -> Self {
        Self {
            success: false,
            is_error: true,
            content: vec![ToolResultContent {
                content_type: "text".into(),
                text: Some(message.into()),
                data: None,
                mime_type: None,
            }],
        }
    }

    /// Extract all text content as a single string.
    pub fn as_text(&self) -> String {
        self.content
            .iter()
            .filter_map(|c| c.text.clone())
            .collect::<Vec<_>>()
            .join("\n")
    }
}
