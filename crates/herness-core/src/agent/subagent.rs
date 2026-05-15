use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tokio::sync::Mutex;

/// Configuration for a subagent.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SubagentConfig {
    /// Unique name for this subagent type
    pub name: String,
    /// Human-readable description
    pub description: String,
    /// System prompt that defines the subagent's behavior
    pub system_prompt: String,
    /// Override the parent's model (None = inherit from parent)
    pub model: Option<String>,
    /// Maximum tokens for subagent responses
    pub max_tokens: Option<u32>,
    /// Temperature override
    pub temperature: Option<f64>,
    /// Maximum conversation turns before auto-termination
    pub max_turns: Option<u32>,
    /// Tools this subagent has access to (empty = inherit from parent)
    pub tools: Vec<String>,
    /// Skills this subagent has access to
    pub skills: Vec<String>,
}

impl SubagentConfig {
    pub fn new(name: impl Into<String>, system_prompt: impl Into<String>) -> Self {
        Self {
            name: name.into(),
            description: String::new(),
            system_prompt: system_prompt.into(),
            model: None,
            max_tokens: None,
            temperature: None,
            max_turns: None,
            tools: Vec::new(),
            skills: Vec::new(),
        }
    }

    pub fn with_description(mut self, desc: impl Into<String>) -> Self {
        self.description = desc.into();
        self
    }

    pub fn with_model(mut self, model: impl Into<String>) -> Self {
        self.model = Some(model.into());
        self
    }

    pub fn with_tools(mut self, tools: Vec<String>) -> Self {
        self.tools = tools;
        self
    }

    pub fn with_skills(mut self, skills: Vec<String>) -> Self {
        self.skills = skills;
        self
    }
}

/// The lifecycle state of a subagent.
#[derive(Debug, Clone, PartialEq)]
pub enum SubagentState {
    /// Not yet started
    Idle,
    /// Currently executing
    Running,
    /// Completed successfully
    Completed,
    /// Failed with an error message
    Failed(String),
    /// Cancelled by parent
    Cancelled,
}

/// The result of a subagent execution.
#[derive(Debug, Clone)]
pub struct SubagentResult {
    /// The subagent name
    pub name: String,
    /// Whether execution was successful
    pub success: bool,
    /// The final output text
    pub output: String,
    /// Number of turns taken
    pub turns: u32,
    /// Any error message if failed
    pub error: Option<String>,
}

impl SubagentResult {
    pub fn success(name: impl Into<String>, output: impl Into<String>, turns: u32) -> Self {
        Self {
            name: name.into(),
            success: true,
            output: output.into(),
            turns,
            error: None,
        }
    }

    pub fn failure(name: impl Into<String>, error: impl Into<String>) -> Self {
        Self {
            name: name.into(),
            success: false,
            output: String::new(),
            turns: 0,
            error: Some(error.into()),
        }
    }
}

/// A subagent instance with isolated state and lifecycle management.
pub struct Subagent {
    pub config: SubagentConfig,
    pub instance_id: String,
    state: Arc<Mutex<SubagentState>>,
    /// Messages collected during execution (isolated context)
    conversation: Arc<Mutex<Vec<SubagentMessage>>>,
    turn_count: Arc<Mutex<u32>>,
}

/// A message in the subagent's isolated conversation context.
#[derive(Debug, Clone)]
pub struct SubagentMessage {
    pub role: String,
    pub content: String,
}

impl SubagentMessage {
    pub fn user(content: impl Into<String>) -> Self {
        Self {
            role: "user".into(),
            content: content.into(),
        }
    }

    pub fn assistant(content: impl Into<String>) -> Self {
        Self {
            role: "assistant".into(),
            content: content.into(),
        }
    }

    pub fn system(content: impl Into<String>) -> Self {
        Self {
            role: "system".into(),
            content: content.into(),
        }
    }
}

impl Subagent {
    pub fn new(config: SubagentConfig) -> Self {
        Self {
            instance_id: uuid::Uuid::new_v4().to_string(),
            config,
            state: Arc::new(Mutex::new(SubagentState::Idle)),
            conversation: Arc::new(Mutex::new(Vec::new())),
            turn_count: Arc::new(Mutex::new(0)),
        }
    }

    pub fn with_id(mut self, id: impl Into<String>) -> Self {
        self.instance_id = id.into();
        self
    }

    /// Get the current state.
    pub async fn state(&self) -> SubagentState {
        self.state.lock().await.clone()
    }

    /// Get the isolated conversation history.
    pub async fn conversation(&self) -> Vec<SubagentMessage> {
        self.conversation.lock().await.clone()
    }

    /// Get the number of turns taken.
    pub async fn turn_count(&self) -> u32 {
        *self.turn_count.lock().await
    }

    /// Transition to Running state.
    pub async fn start(&mut self) -> Result<(), String> {
        let mut state = self.state.lock().await;
        match *state {
            SubagentState::Idle => {
                *state = SubagentState::Running;
                Ok(())
            }
            ref s => Err(format!("Cannot start from state {:?}", s)),
        }
    }

    /// Transition to Completed state.
    pub async fn complete(&mut self) -> Result<(), String> {
        let mut state = self.state.lock().await;
        match *state {
            SubagentState::Running => {
                *state = SubagentState::Completed;
                Ok(())
            }
            ref s => Err(format!("Cannot complete from state {:?}", s)),
        }
    }

    /// Transition to Failed state.
    pub async fn fail(&mut self, error: impl Into<String>) -> Result<(), String> {
        let mut state = self.state.lock().await;
        match *state {
            SubagentState::Running => {
                *state = SubagentState::Failed(error.into());
                Ok(())
            }
            ref s => Err(format!("Cannot fail from state {:?}", s)),
        }
    }

    /// Transition to Cancelled state.
    pub async fn cancel(&mut self) -> Result<(), String> {
        let mut state = self.state.lock().await;
        match *state {
            SubagentState::Running | SubagentState::Idle => {
                *state = SubagentState::Cancelled;
                Ok(())
            }
            ref s => Err(format!("Cannot cancel from state {:?}", s)),
        }
    }

    /// Add a message to the subagent's isolated conversation.
    pub async fn add_message(&self, msg: SubagentMessage) {
        self.conversation.lock().await.push(msg);
    }

    /// Increment the turn counter.
    pub async fn increment_turn(&self) -> u32 {
        let mut count = self.turn_count.lock().await;
        *count += 1;
        *count
    }

    /// Check if the subagent has exceeded its max turns.
    pub async fn is_over_max_turns(&self) -> bool {
        if let Some(max) = self.config.max_turns {
            *self.turn_count.lock().await >= max
        } else {
            false
        }
    }

    /// Build the system prompt for this subagent (including skills context).
    pub fn build_system_prompt(&self) -> String {
        self.config.system_prompt.clone()
    }

    /// Check if the subagent is in a terminal state.
    pub async fn is_terminal(&self) -> bool {
        matches!(
            self.state().await,
            SubagentState::Completed | SubagentState::Failed(_) | SubagentState::Cancelled
        )
    }
}

/// Manager for spawning and tracking multiple subagents.
pub struct SubagentManager {
    subagents: Vec<Subagent>,
}

impl SubagentManager {
    pub fn new() -> Self {
        Self {
            subagents: Vec::new(),
        }
    }

    /// Spawn a new subagent with the given config.
    pub fn spawn(&mut self, config: SubagentConfig) -> &Subagent {
        let subagent = Subagent::new(config);
        self.subagents.push(subagent);
        self.subagents.last().unwrap()
    }

    /// Get a subagent by instance ID.
    pub fn get(&self, instance_id: &str) -> Option<&Subagent> {
        self.subagents
            .iter()
            .find(|s| s.instance_id == instance_id)
    }

    /// Get a mutable reference to a subagent.
    pub fn get_mut(&mut self, instance_id: &str) -> Option<&mut Subagent> {
        self.subagents
            .iter_mut()
            .find(|s| s.instance_id == instance_id)
    }

    /// List all subagents by name.
    pub fn find_by_name(&self, name: &str) -> Vec<&Subagent> {
        self.subagents
            .iter()
            .filter(|s| s.config.name == name)
            .collect()
    }

    /// All active subagents.
    pub fn all(&self) -> &[Subagent] {
        &self.subagents
    }

    /// Remove terminated subagents.
    pub async fn cleanup(&mut self) -> usize {
        let before = self.subagents.len();
        // We need to collect indices first since we can't hold a mutable ref and async simultaneously
        let mut to_remove: Vec<usize> = Vec::new();
        for (i, sub) in self.subagents.iter().enumerate() {
            if sub.is_terminal().await {
                to_remove.push(i);
            }
        }
        // Remove in reverse order
        for i in to_remove.into_iter().rev() {
            self.subagents.remove(i);
        }
        before - self.subagents.len()
    }

    pub fn len(&self) -> usize {
        self.subagents.len()
    }

    pub fn is_empty(&self) -> bool {
        self.subagents.is_empty()
    }
}

impl Default for SubagentManager {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_subagent_initial_state() {
        let config = SubagentConfig::new("test", "You are a test agent.");
        let subagent = Subagent::new(config);
        assert_eq!(subagent.state().await, SubagentState::Idle);
    }

    #[tokio::test]
    async fn test_subagent_lifecycle() {
        let config = SubagentConfig::new("worker", "Do work.");
        let mut subagent = Subagent::new(config);

        // Start
        assert!(subagent.start().await.is_ok());
        assert_eq!(subagent.state().await, SubagentState::Running);

        // Complete
        assert!(subagent.complete().await.is_ok());
        assert_eq!(subagent.state().await, SubagentState::Completed);
    }

    #[tokio::test]
    async fn test_subagent_cannot_start_twice() {
        let config = SubagentConfig::new("worker", "Do work.");
        let mut subagent = Subagent::new(config);
        subagent.start().await.unwrap();
        assert!(subagent.start().await.is_err());
    }

    #[tokio::test]
    async fn test_subagent_fail() {
        let config = SubagentConfig::new("worker", "Do work.");
        let mut subagent = Subagent::new(config);
        subagent.start().await.unwrap();
        subagent.fail("Something went wrong").await.unwrap();
        match subagent.state().await {
            SubagentState::Failed(msg) => assert!(msg.contains("wrong")),
            s => panic!("Expected Failed, got {:?}", s),
        }
    }

    #[tokio::test]
    async fn test_subagent_cancel() {
        let config = SubagentConfig::new("worker", "Do work.");
        let mut subagent = Subagent::new(config);
        subagent.cancel().await.unwrap();
        assert_eq!(subagent.state().await, SubagentState::Cancelled);
    }

    #[tokio::test]
    async fn test_subagent_isolated_conversation() {
        let config = SubagentConfig::new("worker", "Do work.");
        let subagent = Subagent::new(config);

        subagent.add_message(SubagentMessage::system("System")).await;
        subagent.add_message(SubagentMessage::user("Query")).await;
        subagent.add_message(SubagentMessage::assistant("Response")).await;

        let conv = subagent.conversation().await;
        assert_eq!(conv.len(), 3);
        assert_eq!(conv[0].role, "system");
        assert_eq!(conv[1].role, "user");
        assert_eq!(conv[2].role, "assistant");
    }

    #[tokio::test]
    async fn test_subagent_max_turns() {
        let config = SubagentConfig::new("worker", "Do work.")
            .with_description("test");
        let subagent = Subagent::new(config);

        // No max_turns set, should never be over
        assert!(!subagent.is_over_max_turns().await);

        for _ in 0..10 {
            subagent.increment_turn().await;
        }
        assert_eq!(subagent.turn_count().await, 10);
    }

    #[tokio::test]
    async fn test_subagent_max_turns_enforced() {
        let mut config = SubagentConfig::new("worker", "Do work.");
        config.max_turns = Some(5);
        let subagent = Subagent::new(config);

        for _ in 0..5 {
            subagent.increment_turn().await;
        }
        assert!(subagent.is_over_max_turns().await);
    }

    #[test]
    fn test_subagent_result_success() {
        let result = SubagentResult::success("test", "output text", 3);
        assert!(result.success);
        assert_eq!(result.output, "output text");
        assert_eq!(result.turns, 3);
        assert!(result.error.is_none());
    }

    #[test]
    fn test_subagent_result_failure() {
        let result = SubagentResult::failure("test", "Something broke");
        assert!(!result.success);
        assert_eq!(result.error.unwrap(), "Something broke");
    }

    #[tokio::test]
    async fn test_subagent_manager_spawn() {
        let mut manager = SubagentManager::new();
        let config = SubagentConfig::new("analyst", "Analyze data.");
        let instance_id = {
            let sub = manager.spawn(config);
            sub.instance_id.clone()
        };

        assert_eq!(manager.len(), 1);
        assert!(manager.get(&instance_id).is_some());
    }

    #[tokio::test]
    async fn test_subagent_manager_cleanup() {
        let mut manager = SubagentManager::new();

        let config1 = SubagentConfig::new("a", "A");
        let mut sub1 = Subagent::new(config1);
        sub1.start().await.unwrap();
        sub1.complete().await.unwrap();
        manager.subagents.push(sub1);

        let config2 = SubagentConfig::new("b", "B");
        let mut sub2 = Subagent::new(config2);
        sub2.start().await.unwrap();
        manager.subagents.push(sub2);

        let removed = manager.cleanup().await;
        assert_eq!(removed, 1);
        assert_eq!(manager.len(), 1);
    }

    #[test]
    fn test_subagent_config_builder() {
        let config = SubagentConfig::new("helper", "You are helpful.")
            .with_description("A helpful agent")
            .with_model("claude-haiku-4-5")
            .with_tools(vec!["read".into(), "write".into()])
            .with_skills(vec!["code-review".into()]);

        assert_eq!(config.name, "helper");
        assert_eq!(config.description, "A helpful agent");
        assert_eq!(config.model, Some("claude-haiku-4-5".into()));
        assert_eq!(config.tools.len(), 2);
        assert_eq!(config.skills.len(), 1);
    }
}
