use crate::agent::subagent::{SubagentManager, SubagentConfig};
use crate::agent::Agent;
use crate::conversation::Conversation;
use crate::skill_runtime::registry::SkillRuntimeRegistry;

/// The Orchestrator ties together the agent, conversation, LLM provider, tools,
/// skills, and subagents.
pub struct Orchestrator {
    agent: Agent,
    conversation: Conversation,
    subagent_manager: SubagentManager,
    skill_registry: SkillRuntimeRegistry,
}

impl Orchestrator {
    pub fn new(agent: Agent, conversation: Conversation) -> Self {
        Self {
            agent,
            conversation,
            subagent_manager: SubagentManager::new(),
            skill_registry: SkillRuntimeRegistry::new(),
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

    /// Get the subagent manager for spawning and tracking subagents.
    pub fn subagent_manager(&self) -> &SubagentManager {
        &self.subagent_manager
    }

    pub fn subagent_manager_mut(&mut self) -> &mut SubagentManager {
        &mut self.subagent_manager
    }

    /// Get the skill registry.
    pub fn skill_registry(&self) -> &SkillRuntimeRegistry {
        &self.skill_registry
    }

    pub fn skill_registry_mut(&mut self) -> &mut SkillRuntimeRegistry {
        &mut self.skill_registry
    }

    /// Spawn a subagent with the given config.
    pub fn spawn_subagent(&mut self, config: SubagentConfig) -> &crate::agent::subagent::Subagent {
        self.subagent_manager.spawn(config)
    }

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
