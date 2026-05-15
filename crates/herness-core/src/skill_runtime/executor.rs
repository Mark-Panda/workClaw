use crate::agent::skill::SkillDefinition;
use crate::skill_runtime::context::ExecutionContext;

/// Result of executing a skill.
#[derive(Debug, Clone)]
pub struct SkillExecutionResult {
    pub skill_name: String,
    pub success: bool,
    /// The system prompt fragment that was injected
    pub system_prompt_injected: String,
    /// Any output from the skill execution
    pub output: String,
}

/// The skill executor converts skill definitions into LLM context and
/// manages skill execution lifecycle.
pub struct SkillExecutor {
    /// Environment context for shell-based skills
    context: ExecutionContext,
}

impl SkillExecutor {
    pub fn new() -> Self {
        Self {
            context: ExecutionContext::new(),
        }
    }

    pub fn with_context(mut self, ctx: ExecutionContext) -> Self {
        self.context = ctx;
        self
    }

    /// Prepare a skill for injection into the system prompt.
    /// This returns the prompt fragment that describes the skill's
    /// capabilities and instructions to the LLM.
    pub fn prepare_skill(skill: &SkillDefinition) -> String {
        skill.to_system_prompt()
    }

    /// Prepare all skills as a combined system prompt fragment.
    pub fn prepare_all_skills(skills: &[SkillDefinition]) -> String {
        if skills.is_empty() {
            return String::new();
        }
        let mut parts = vec!["<skills>".to_string()];
        for skill in skills {
            parts.push(skill.to_system_prompt());
        }
        parts.push("</skills>".to_string());
        parts.join("\n")
    }

    /// Inject skills into a base system prompt.
    pub fn augment_system_prompt(base_prompt: &str, skills: &[SkillDefinition]) -> String {
        let skills_prompt = Self::prepare_all_skills(skills);
        if skills_prompt.is_empty() {
            return base_prompt.to_string();
        }
        format!("{}\n\n{}", base_prompt, skills_prompt)
    }

    /// Execute a skill. Currently this is a preparation step that
    /// returns the prompt context; shell-based execution can be added
    /// for skills that need to run commands.
    pub async fn execute(
        &self,
        skill: &SkillDefinition,
    ) -> anyhow::Result<SkillExecutionResult> {
        let prompt = Self::prepare_skill(skill);
        Ok(SkillExecutionResult {
            skill_name: skill.name.clone(),
            success: true,
            system_prompt_injected: prompt,
            output: String::new(),
        })
    }

    /// Get the execution context.
    pub fn context(&self) -> &ExecutionContext {
        &self.context
    }
}

impl Default for SkillExecutor {
    fn default() -> Self {
        Self::new()
    }
}

/// A trait for types that can be converted into skill system prompts.
pub trait SkillPrompt {
    fn to_skill_prompt(&self) -> String;
}

impl SkillPrompt for SkillDefinition {
    fn to_skill_prompt(&self) -> String {
        self.to_system_prompt()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_skill(name: &str, body: &str) -> SkillDefinition {
        SkillDefinition {
            name: name.into(),
            description: format!("Description for {}", name),
            version: "1.0".into(),
            body: body.into(),
            tools: vec![],
            dependencies: vec![],
        }
    }

    #[test]
    fn test_prepare_single_skill() {
        let skill = make_skill("test", "Do the thing");
        let prompt = SkillExecutor::prepare_skill(&skill);
        assert!(prompt.contains("<skill>"));
        assert!(prompt.contains("<name>test</name>"));
        assert!(prompt.contains("Do the thing"));
    }

    #[test]
    fn test_prepare_all_skills_empty() {
        let prompt = SkillExecutor::prepare_all_skills(&[]);
        assert_eq!(prompt, "");
    }

    #[test]
    fn test_prepare_all_skills_multiple() {
        let skills = vec![
            make_skill("a", "do a"),
            make_skill("b", "do b"),
        ];
        let prompt = SkillExecutor::prepare_all_skills(&skills);
        assert!(prompt.contains("<skills>"));
        assert!(prompt.contains("<name>a</name>"));
        assert!(prompt.contains("<name>b</name>"));
        assert!(prompt.contains("</skills>"));
    }

    #[test]
    fn test_augment_system_prompt() {
        let skills = vec![make_skill("helper", "Be helpful")];
        let result = SkillExecutor::augment_system_prompt("You are an AI.", &skills);
        assert!(result.starts_with("You are an AI."));
        assert!(result.contains("<skills>"));
    }

    #[test]
    fn test_augment_system_prompt_no_skills() {
        let result = SkillExecutor::augment_system_prompt("Base prompt", &[]);
        assert_eq!(result, "Base prompt");
    }

    #[tokio::test]
    async fn test_execute_skill() {
        let executor = SkillExecutor::new();
        let skill = make_skill("runner", "Run tasks");
        let result = executor.execute(&skill).await.unwrap();
        assert!(result.success);
        assert_eq!(result.skill_name, "runner");
        assert!(result.system_prompt_injected.contains("<skill>"));
    }
}
