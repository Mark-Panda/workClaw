use super::protocol::ToolDef;
use super::transport::{StdioTransportConfig, TransportType};
use serde::{Deserialize, Serialize};

/// Configuration for connecting to an MCP server.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct McpClientConfig {
    /// Human-readable name for this MCP server
    pub name: String,
    /// Transport type
    pub transport: TransportType,
    /// Command for stdio transport
    #[serde(skip_serializing_if = "Option::is_none")]
    pub command: Option<String>,
    /// Arguments for stdio transport
    #[serde(skip_serializing_if = "Option::is_none")]
    pub args: Option<Vec<String>>,
    /// URL for SSE/HTTP transport
    #[serde(skip_serializing_if = "Option::is_none")]
    pub url: Option<String>,
    /// Environment variables for stdio transport
    #[serde(skip_serializing_if = "Option::is_none")]
    pub env: Option<std::collections::HashMap<String, String>>,
}

impl McpClientConfig {
    pub fn stdio(command: impl Into<String>, args: Vec<String>) -> Self {
        let cmd: String = command.into();
        Self {
            name: cmd.clone(),
            transport: TransportType::Stdio,
            command: Some(cmd),
            args: Some(args),
            url: None,
            env: None,
        }
    }

    pub fn sse(name: impl Into<String>, url: impl Into<String>) -> Self {
        Self {
            name: name.into(),
            transport: TransportType::Sse,
            command: None,
            args: None,
            url: Some(url.into()),
            env: None,
        }
    }

    /// Convert to a stdio transport config suitable for process spawning.
    pub fn to_stdio_config(&self) -> Option<StdioTransportConfig> {
        let command = self.command.as_ref()?;
        let mut config = StdioTransportConfig::new(command);
        if let Some(args) = &self.args {
            config = config.with_args(args.clone());
        }
        if let Some(env) = &self.env {
            for (k, v) in env {
                config = config.with_env(k, v);
            }
        }
        Some(config)
    }
}

/// The state of an MCP client connection.
#[derive(Debug, Clone)]
pub struct McpClient {
    pub config: McpClientConfig,
    /// Tools discovered from the server
    tools: Vec<ToolDef>,
    /// Whether the client is connected
    connected: bool,
    /// Server info from initialize response
    server_name: Option<String>,
    server_version: Option<String>,
}

impl McpClient {
    pub fn new(config: McpClientConfig) -> Self {
        Self {
            config,
            tools: Vec::new(),
            connected: false,
            server_name: None,
            server_version: None,
        }
    }

    /// Register tools manually (for when actual MCP connection isn't available)
    pub fn register_tools(&mut self, tools: Vec<ToolDef>) {
        self.tools = tools;
    }

    /// Mark the client as connected after successful initialization
    pub fn mark_connected(
        &mut self,
        server_name: String,
        server_version: String,
        tools: Vec<ToolDef>,
    ) {
        self.connected = true;
        self.server_name = Some(server_name);
        self.server_version = Some(server_version);
        self.tools = tools;
    }

    /// Mark the client as disconnected
    pub fn mark_disconnected(&mut self) {
        self.connected = false;
        self.tools.clear();
    }

    /// List tools discovered from this MCP server.
    pub fn tools(&self) -> &[ToolDef] {
        &self.tools
    }

    /// Get a specific tool by name.
    pub fn get_tool(&self, name: &str) -> Option<&ToolDef> {
        self.tools.iter().find(|t| t.name == name)
    }

    /// Whether the client is connected to the MCP server.
    pub fn is_connected(&self) -> bool {
        self.connected
    }

    /// Get server info.
    pub fn server_info(&self) -> Option<(&str, &str)> {
        match (&self.server_name, &self.server_version) {
            (Some(name), Some(version)) => Some((name.as_str(), version.as_str())),
            _ => None,
        }
    }

    /// Convert tools to JSON format suitable for LLM tool definitions.
    pub fn tools_as_llm_tools(&self) -> Vec<serde_json::Value> {
        self.tools
            .iter()
            .map(|t| {
                serde_json::json!({
                    "name": t.name,
                    "description": t.description,
                    "input_schema": t.input_schema
                })
            })
            .collect()
    }

    /// Build an MCP tool result message for conversation history.
    pub fn build_tool_result_message(
        tool_call_id: &str,
        result_content: &str,
    ) -> serde_json::Value {
        serde_json::json!({
            "role": "tool",
            "tool_call_id": tool_call_id,
            "content": result_content
        })
    }
}

/// Manager for multiple MCP server connections.
#[derive(Debug, Clone, Default)]
pub struct McpManager {
    clients: Vec<McpClient>,
}

impl McpManager {
    pub fn new() -> Self {
        Self {
            clients: Vec::new(),
        }
    }

    pub fn add_client(&mut self, client: McpClient) {
        self.clients.push(client);
    }

    pub fn get_client(&self, name: &str) -> Option<&McpClient> {
        self.clients.iter().find(|c| c.config.name == name)
    }

    pub fn get_client_mut(&mut self, name: &str) -> Option<&mut McpClient> {
        self.clients.iter_mut().find(|c| c.config.name == name)
    }

    pub fn clients(&self) -> &[McpClient] {
        &self.clients
    }

    /// Collect all tools from all connected clients, with source annotations.
    pub fn all_tools(&self) -> Vec<ToolDef> {
        let mut tools = Vec::new();
        for client in &self.clients {
            tools.extend(client.tools().iter().cloned());
        }
        tools
    }

    /// Collect all tools as LLM-compatible JSON from all clients.
    pub fn all_tools_as_llm(&self) -> Vec<serde_json::Value> {
        self.clients
            .iter()
            .flat_map(|c| c.tools_as_llm_tools())
            .collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_mcp_client_new() {
        let config = McpClientConfig {
            name: "test-server".into(),
            transport: TransportType::Stdio,
            command: Some("node".into()),
            args: Some(vec!["server.js".into()]),
            url: None,
            env: None,
        };
        let client = McpClient::new(config);
        assert_eq!(client.tools().len(), 0);
        assert!(!client.is_connected());
    }

    #[test]
    fn test_mcp_client_connect_disconnect() {
        let config = McpClientConfig::stdio("echo", vec![]);
        let mut client = McpClient::new(config);

        let tools = vec![ToolDef {
            name: "echo".into(),
            description: "Echo back input".into(),
            input_schema: serde_json::json!({}),
        }];

        client.mark_connected("echo-server".into(), "1.0".into(), tools);
        assert!(client.is_connected());
        assert_eq!(client.tools().len(), 1);
        assert_eq!(client.server_info().unwrap(), ("echo-server", "1.0"));

        client.mark_disconnected();
        assert!(!client.is_connected());
        assert_eq!(client.tools().len(), 0);
    }

    #[test]
    fn test_tools_as_llm() {
        let config = McpClientConfig::stdio("test", vec![]);
        let mut client = McpClient::new(config);

        client.register_tools(vec![ToolDef {
            name: "read".into(),
            description: "Read a file".into(),
            input_schema: serde_json::json!({"type": "object", "properties": {"path": {"type": "string"}}}),
        }]);

        let llm_tools = client.tools_as_llm_tools();
        assert_eq!(llm_tools.len(), 1);
        assert_eq!(llm_tools[0]["name"], "read");
        assert_eq!(llm_tools[0]["description"], "Read a file");
    }

    #[test]
    fn test_mcp_manager_multiple_clients() {
        let mut manager = McpManager::new();

        let mut c1 = McpClient::new(McpClientConfig::stdio("filesystem", vec![]));
        c1.register_tools(vec![ToolDef {
            name: "read_file".into(),
            description: "Read a file".into(),
            input_schema: serde_json::json!({}),
        }]);

        let mut c2 = McpClient::new(McpClientConfig::stdio("database", vec![]));
        c2.register_tools(vec![ToolDef {
            name: "query".into(),
            description: "Run a query".into(),
            input_schema: serde_json::json!({}),
        }]);

        manager.add_client(c1);
        manager.add_client(c2);

        assert_eq!(manager.clients().len(), 2);
        assert_eq!(manager.all_tools().len(), 2);
        assert!(manager.get_client("filesystem").is_some());
        assert!(manager.get_client("nonexistent").is_none());
    }

    #[test]
    fn test_mcp_config_stdio() {
        let config = McpClientConfig::stdio("python", vec!["-m".into(), "mcp_server".into()]);
        let stdio = config.to_stdio_config().unwrap();
        assert_eq!(stdio.command, "python");
        assert_eq!(stdio.args, vec!["-m", "mcp_server"]);
    }
}
