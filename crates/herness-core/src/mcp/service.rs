use super::client::{McpClient, McpClientConfig};
use super::protocol::ToolDef;

/// High-level MCP service that manages connections to MCP servers.
///
/// Wraps the `rmcp` crate for low-level MCP protocol handling while
/// providing a simplified async API for tool discovery and calling.
pub struct McpService {
    clients: Vec<McpClient>,
}

impl McpService {
    pub fn new() -> Self {
        Self {
            clients: Vec::new(),
        }
    }

    /// Register a client configuration (without connecting).
    pub fn register(&mut self, config: McpClientConfig) -> &mut McpClient {
        let client = McpClient::new(config);
        self.clients.push(client);
        self.clients.last_mut().unwrap()
    }

    /// Get all registered clients.
    pub fn clients(&self) -> &[McpClient] {
        &self.clients
    }

    /// Get a mutable reference to a client.
    pub fn client_mut(&mut self, name: &str) -> Option<&mut McpClient> {
        self.clients.iter_mut().find(|c| c.config.name == name)
    }

    /// Get a client by name.
    pub fn client(&self, name: &str) -> Option<&McpClient> {
        self.clients.iter().find(|c| c.config.name == name)
    }

    /// Collect all tools from all connected clients.
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

    /// Remove a client by name.
    pub fn remove(&mut self, name: &str) -> Option<McpClient> {
        if let Some(pos) = self.clients.iter().position(|c| c.config.name == name) {
            Some(self.clients.remove(pos))
        } else {
            None
        }
    }

    /// Number of registered clients.
    pub fn len(&self) -> usize {
        self.clients.len()
    }

    pub fn is_empty(&self) -> bool {
        self.clients.is_empty()
    }
}

impl Default for McpService {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_service_register_client() {
        let mut service = McpService::new();
        let config = McpClientConfig::stdio("test", vec![]);
        service.register(config);
        assert_eq!(service.clients().len(), 1);
    }

    #[test]
    fn test_service_all_tools() {
        let mut service = McpService::new();

        let mut c1 = McpClient::new(McpClientConfig::stdio("echo", vec![]));
        c1.register_tools(vec![ToolDef {
            name: "echo".into(),
            description: "Echo".into(),
            input_schema: serde_json::json!({}),
        }]);
        service.clients.push(c1);

        let tools = service.all_tools();
        assert_eq!(tools.len(), 1);
    }

    #[test]
    fn test_service_all_tools_as_llm() {
        let mut service = McpService::new();
        let mut client = McpClient::new(McpClientConfig::stdio("test", vec![]));
        client.register_tools(vec![
            ToolDef {
                name: "t1".into(),
                description: "desc".into(),
                input_schema: serde_json::json!({}),
            },
            ToolDef {
                name: "t2".into(),
                description: "desc".into(),
                input_schema: serde_json::json!({}),
            },
        ]);
        service.clients.push(client);

        let tools = service.all_tools_as_llm();
        assert_eq!(tools.len(), 2);
    }

    #[test]
    fn test_service_remove_client() {
        let mut service = McpService::new();
        service.register(McpClientConfig::stdio("keep", vec![]));
        service.register(McpClientConfig::stdio("remove", vec![]));
        assert_eq!(service.len(), 2);

        let removed = service.remove("remove");
        assert!(removed.is_some());
        assert_eq!(service.len(), 1);
        assert!(service.client("remove").is_none());
    }
}
