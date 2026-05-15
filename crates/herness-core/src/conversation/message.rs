use chrono::{DateTime, Utc};
use herness_common::types::MessageRole;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Message {
    pub id: String,
    pub conversation_id: Option<String>,
    pub role: MessageRole,
    pub content: String,
    pub tool_calls: Option<Vec<ToolCall>>,
    pub tool_call_id: Option<String>,
    pub token_count: Option<i64>,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolCall {
    pub id: String,
    pub name: String,
    pub arguments: serde_json::Value,
}

impl Message {
    pub fn user(id: String, content: String) -> Self {
        Self {
            id,
            conversation_id: None,
            role: MessageRole::User,
            content,
            tool_calls: None,
            tool_call_id: None,
            token_count: None,
            created_at: Utc::now(),
        }
    }

    pub fn assistant(id: String, content: String) -> Self {
        Self {
            id,
            conversation_id: None,
            role: MessageRole::Assistant,
            content,
            tool_calls: None,
            tool_call_id: None,
            token_count: None,
            created_at: Utc::now(),
        }
    }

    pub fn system(content: String) -> Self {
        Self {
            id: "system".into(),
            conversation_id: None,
            role: MessageRole::System,
            content,
            tool_calls: None,
            tool_call_id: None,
            token_count: None,
            created_at: Utc::now(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_user_message() {
        let msg = Message::user("msg-1".into(), "Hello".into());
        assert_eq!(msg.role, MessageRole::User);
        assert_eq!(msg.content, "Hello");
    }

    #[test]
    fn test_assistant_message() {
        let msg = Message::assistant("msg-2".into(), "Hi there".into());
        assert_eq!(msg.role, MessageRole::Assistant);
        assert_eq!(msg.content, "Hi there");
    }
}
