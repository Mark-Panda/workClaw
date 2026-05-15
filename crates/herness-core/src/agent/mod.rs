pub mod skill;
pub mod subagent;

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentConfig {
    pub model: String,
    pub system_prompt: String,
    pub temperature: f64,
    pub max_tokens: u32,
}

impl Default for AgentConfig {
    fn default() -> Self {
        Self {
            model: "claude-sonnet-4-6".to_string(),
            system_prompt: "You are a helpful AI assistant.".to_string(),
            temperature: 0.7,
            max_tokens: 4096,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Agent {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub config: AgentConfig,
    pub status: String,
}

impl Agent {
    pub fn new(id: String, name: String) -> Self {
        Self {
            id,
            name,
            description: None,
            config: AgentConfig::default(),
            status: "stopped".to_string(),
        }
    }

    pub fn is_running(&self) -> bool {
        self.status == "running"
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_agent_new_has_stopped_status() {
        let agent = Agent::new("test-id".into(), "Test Agent".into());
        assert_eq!(agent.status, "stopped");
        assert!(!agent.is_running());
    }

    #[test]
    fn test_agent_config_defaults() {
        let config = AgentConfig::default();
        assert_eq!(config.model, "claude-sonnet-4-6");
        assert_eq!(config.temperature, 0.7);
        assert_eq!(config.max_tokens, 4096);
    }
}
