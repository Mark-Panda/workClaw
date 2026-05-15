use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// Transport type for MCP server communication.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum TransportType {
    /// Spawn MCP server as a child process, communicate via stdio
    Stdio,
    /// Connect to MCP server via SSE (Server-Sent Events)
    Sse,
    /// Connect to MCP server via Streamable HTTP
    StreamableHttp,
}

/// Configuration for a stdio-based MCP server transport.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StdioTransportConfig {
    /// The command to execute (e.g. "node", "python", "uvx")
    pub command: String,
    /// Arguments for the command
    #[serde(default)]
    pub args: Vec<String>,
    /// Environment variables to set
    #[serde(default)]
    pub env: HashMap<String, String>,
    /// Working directory for the process
    #[serde(skip_serializing_if = "Option::is_none")]
    pub working_dir: Option<String>,
}

impl StdioTransportConfig {
    pub fn new(command: impl Into<String>) -> Self {
        Self {
            command: command.into(),
            args: Vec::new(),
            env: HashMap::new(),
            working_dir: None,
        }
    }

    pub fn with_args(mut self, args: Vec<String>) -> Self {
        self.args = args;
        self
    }

    pub fn with_arg(mut self, arg: impl Into<String>) -> Self {
        self.args.push(arg.into());
        self
    }

    pub fn with_env(mut self, key: impl Into<String>, value: impl Into<String>) -> Self {
        self.env.insert(key.into(), value.into());
        self
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_transport_type_serialization() {
        let t = TransportType::Stdio;
        let json = serde_json::to_string(&t).unwrap();
        assert_eq!(json, "\"stdio\"");

        let t: TransportType = serde_json::from_str("\"sse\"").unwrap();
        assert_eq!(t, TransportType::Sse);
    }

    #[test]
    fn test_stdio_transport_config() {
        let config = StdioTransportConfig::new("node")
            .with_args(vec!["server.js".into(), "--port".into(), "3000".into()])
            .with_env("NODE_ENV", "production");

        assert_eq!(config.command, "node");
        assert_eq!(config.args.len(), 3);
        assert_eq!(config.env.get("NODE_ENV"), Some(&"production".into()));
    }
}
