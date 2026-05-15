use async_trait::async_trait;
use crate::agent::subagent::{SubagentManager, SubagentConfig, ToolExecutor};
use crate::agent::Agent;
use crate::conversation::Conversation;
use crate::mcp::client::{McpClient, McpClientConfig, McpManager};
use crate::skill_runtime::registry::SkillRuntimeRegistry;
use serde_json::Value;

/// The Orchestrator ties together the agent, conversation, LLM provider,
/// MCP tools, skills, and subagents.
pub struct Orchestrator {
    agent: Agent,
    conversation: Conversation,
    subagent_manager: SubagentManager,
    skill_registry: SkillRuntimeRegistry,
    mcp_manager: McpManager,
}

impl Orchestrator {
    pub fn new(agent: Agent, conversation: Conversation) -> Self {
        Self {
            agent,
            conversation,
            subagent_manager: SubagentManager::new(),
            skill_registry: SkillRuntimeRegistry::new(),
            mcp_manager: McpManager::new(),
        }
    }

    pub fn agent(&self) -> &Agent {
        &self.agent
    }

    pub fn conversation(&self) -> &Conversation {
        &self.conversation
    }

    pub fn conversation_mut(&mut self) -> &mut Conversation {
        &mut self.conversation
    }

    pub fn subagent_manager(&self) -> &SubagentManager {
        &self.subagent_manager
    }

    pub fn subagent_manager_mut(&mut self) -> &mut SubagentManager {
        &mut self.subagent_manager
    }

    pub fn skill_registry(&self) -> &SkillRuntimeRegistry {
        &self.skill_registry
    }

    pub fn skill_registry_mut(&mut self) -> &mut SkillRuntimeRegistry {
        &mut self.skill_registry
    }

    // ── MCP ─────────────────────────────────────────────────

    pub fn mcp_manager(&self) -> &McpManager {
        &self.mcp_manager
    }

    pub fn mcp_manager_mut(&mut self) -> &mut McpManager {
        &mut self.mcp_manager
    }

    /// Add an MCP server configuration. Does not connect yet.
    pub fn register_mcp_server(&mut self, config: McpClientConfig) {
        self.mcp_manager.add_client(McpClient::new(config));
    }

    /// Connect all registered MCP servers and discover their tools.
    pub async fn connect_mcp_servers(&mut self) -> Vec<anyhow::Result<()>> {
        self.mcp_manager.connect_all().await
    }

    /// Collect all available tools from MCP servers and skills as
    /// LLM-compatible tool definitions.
    pub fn all_tools_as_llm(&self) -> Vec<Value> {
        self.mcp_manager.all_tools_as_llm()
    }

    /// Execute a tool by name across connected MCP servers.
    pub async fn execute_mcp_tool(
        &self,
        tool_name: &str,
        arguments: Value,
    ) -> anyhow::Result<String> {
        let response = self.mcp_manager.call_tool(tool_name, arguments).await?;
        // Collect text content from the response
        let text = response
            .content
            .iter()
            .filter_map(|c| c.text.clone())
            .collect::<Vec<_>>()
            .join("\n");
        Ok(text)
    }

    // ── Subagent ────────────────────────────────────────────

    /// Spawn a subagent with the given config.
    pub fn spawn_subagent(&mut self, config: SubagentConfig) -> &crate::agent::subagent::Subagent {
        self.subagent_manager.spawn(config)
    }

    // ── System prompt ───────────────────────────────────────

    /// Build the full system prompt including skills context.
    pub fn build_system_prompt(&self) -> String {
        let base = self.agent.config.system_prompt.clone();
        let skills_prompt = self.skill_registry.to_system_prompt();
        if skills_prompt.is_empty() {
            base
        } else {
            format!("{}\n\n{}", base, skills_prompt)
        }
    }
}

#[async_trait]
impl ToolExecutor for Orchestrator {
    async fn execute(&self, name: &str, arguments: Value) -> anyhow::Result<String> {
        self.execute_mcp_tool(name, arguments).await
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::agent::skill::SkillDefinition;

    #[test]
    fn test_orchestrator_new() {
        let agent = Agent::new("agent-1".into(), "Test".into());
        let conv = Conversation::new("conv-1".into(), "agent-1".into());
        let orch = Orchestrator::new(agent, conv);
        assert_eq!(orch.agent().id, "agent-1");
    }

    #[test]
    fn test_orchestrator_spawn_subagent() {
        let agent = Agent::new("agent-1".into(), "Test".into());
        let conv = Conversation::new("conv-1".into(), "agent-1".into());
        let mut orch = Orchestrator::new(agent, conv);

        let config = SubagentConfig::new("code-reviewer", "Review code for bugs.");
        orch.spawn_subagent(config);
        assert_eq!(orch.subagent_manager().len(), 1);
    }

    #[test]
    fn test_orchestrator_system_prompt_with_skills() {
        let agent = Agent::new("agent-1".into(), "Test".into());
        let conv = Conversation::new("conv-1".into(), "agent-1".into());
        let mut orch = Orchestrator::new(agent, conv);

        orch.skill_registry_mut().register(SkillDefinition {
            name: "helper".into(),
            description: "A helper skill".into(),
            version: "1.0".into(),
            body: "Be helpful.".into(),
            tools: vec![],
            dependencies: vec![],
        });

        let prompt = orch.build_system_prompt();
        assert!(prompt.contains("You are a helpful AI assistant."));
        assert!(prompt.contains("<skills>"));
        assert!(prompt.contains("helper"));
    }

    #[test]
    fn test_orchestrator_system_prompt_no_skills() {
        let agent = Agent::new("agent-1".into(), "Test".into());
        let conv = Conversation::new("conv-1".into(), "agent-1".into());
        let orch = Orchestrator::new(agent, conv);

        let prompt = orch.build_system_prompt();
        assert_eq!(prompt, "You are a helpful AI assistant.");
    }
}
