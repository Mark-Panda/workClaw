use serde::{Deserialize, Serialize};

/// A parsed SKILL.md definition with frontmatter and body instructions.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SkillDefinition {
    pub name: String,
    pub description: String,
    pub version: String,
    /// The markdown body (instructions) parsed from SKILL.md
    #[serde(default)]
    pub body: String,
    /// Optional tools this skill requires
    #[serde(default)]
    pub tools: Vec<String>,
    /// Optional dependencies (other skill names)
    #[serde(default)]
    pub dependencies: Vec<String>,
}

impl SkillDefinition {
    /// Build the full system prompt fragment for this skill.
    pub fn to_system_prompt(&self) -> String {
        let mut prompt = format!(
            "<skill>\n<name>{}</name>\n<description>{}</description>\n",
            self.name, self.description
        );
        if !self.body.is_empty() {
            prompt.push_str(&format!(
                "<instructions>\n{}\n</instructions>\n",
                self.body
            ));
        }
        prompt.push_str("</skill>");
        prompt
    }
}

#[derive(Debug, Clone, Default)]
pub struct SkillRegistry {
    skills: Vec<SkillDefinition>,
}

impl SkillRegistry {
    pub fn new() -> Self {
        Self { skills: Vec::new() }
    }

    pub fn register(&mut self, skill: SkillDefinition) {
        self.skills.push(skill);
    }

    pub fn list(&self) -> &[SkillDefinition] {
        &self.skills
    }

    pub fn get(&self, name: &str) -> Option<&SkillDefinition> {
        self.skills.iter().find(|s| s.name == name)
    }

    pub fn len(&self) -> usize {
        self.skills.len()
    }

    pub fn is_empty(&self) -> bool {
        self.skills.is_empty()
    }

    /// Build a combined system prompt from all registered skills.
    pub fn to_system_prompt(&self) -> String {
        if self.skills.is_empty() {
            return String::new();
        }
        let mut parts = vec!["<skills>".to_string()];
        for skill in &self.skills {
            parts.push(skill.to_system_prompt());
        }
        parts.push("</skills>".to_string());
        parts.join("\n")
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_register_and_get_skill() {
        let mut registry = SkillRegistry::new();
        let skill = SkillDefinition {
            name: "test-skill".into(),
            description: "A test skill".into(),
            version: "1.0".into(),
            body: String::new(),
            tools: vec![],
            dependencies: vec![],
        };
        registry.register(skill);
        assert_eq!(registry.len(), 1);
        assert!(registry.get("test-skill").is_some());
        assert!(registry.get("nonexistent").is_none());
    }

    #[test]
    fn test_skill_to_system_prompt() {
        let skill = SkillDefinition {
            name: "code-reviewer".into(),
            description: "Review code for bugs".into(),
            version: "1.0".into(),
            body: "Check for bugs and style issues.".into(),
            tools: vec![],
            dependencies: vec![],
        };
        let prompt = skill.to_system_prompt();
        assert!(prompt.contains("<skill>"));
        assert!(prompt.contains("<name>code-reviewer</name>"));
        assert!(prompt.contains("<instructions>"));
        assert!(prompt.contains("Check for bugs"));
    }

    #[test]
    fn test_registry_to_system_prompt_empty() {
        let registry = SkillRegistry::new();
        assert_eq!(registry.to_system_prompt(), "");
    }

    #[test]
    fn test_registry_to_system_prompt_multiple() {
        let mut registry = SkillRegistry::new();
        registry.register(SkillDefinition {
            name: "a".into(),
            description: "desc a".into(),
            version: "1".into(),
            body: String::new(),
            tools: vec![],
            dependencies: vec![],
        });
        registry.register(SkillDefinition {
            name: "b".into(),
            description: "desc b".into(),
            version: "1".into(),
            body: String::new(),
            tools: vec![],
            dependencies: vec![],
        });
        let prompt = registry.to_system_prompt();
        assert!(prompt.contains("<skills>"));
        assert!(prompt.contains("<name>a</name>"));
        assert!(prompt.contains("<name>b</name>"));
    }
}
