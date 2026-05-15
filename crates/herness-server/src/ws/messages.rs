use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum ClientMessage {
    #[serde(rename = "chat:send")]
    ChatSend {
        conversation_id: String,
        content: String,
        agent_id: String,
    },
    #[serde(rename = "chat:cancel")]
    ChatCancel { message_id: String },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum ServerMessage {
    #[serde(rename = "chat:token")]
    ChatToken {
        message_id: String,
        token: String,
    },
    #[serde(rename = "chat:done")]
    ChatDone { message_id: String },
    #[serde(rename = "chat:error")]
    ChatError {
        message_id: String,
        error: String,
    },
    #[serde(rename = "chat:thinking")]
    ChatThinking { content: String },
    #[serde(rename = "chat:tool_call")]
    ChatToolCall {
        tool: String,
        args: serde_json::Value,
    },
    #[serde(rename = "chat:tool_result")]
    ChatToolResult {
        tool: String,
        result: serde_json::Value,
    },
    #[serde(rename = "rule:node_enter")]
    RuleNodeEnter {
        node_id: String,
        timestamp: i64,
    },
    #[serde(rename = "rule:node_exit")]
    RuleNodeExit {
        node_id: String,
        output: serde_json::Value,
    },
    #[serde(rename = "rule:node_error")]
    RuleNodeError {
        node_id: String,
        error: String,
    },
    #[serde(rename = "rule:complete")]
    RuleComplete {
        chain_id: String,
        result: serde_json::Value,
    },
}
