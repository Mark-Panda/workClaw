use crate::agent::skill::SkillDefinition;
use serde::Deserialize;

/// YAML frontmatter structure parsed from SKILL.md files.
#[derive(Debug, Deserialize)]
struct SkillFrontmatter {
    name: Option<String>,
    description: Option<String>,
    version: Option<String>,
    #[serde(default)]
    tools: Vec<String>,
    #[serde(default)]
    dependencies: Vec<String>,
}

/// Parse a SKILL.md file content into a SkillDefinition.
///
/// Format:
/// ```markdown
/// ---
/// name: skill-name
/// description: What this skill does
/// version: 1.0
/// tools:
///   - tool_a
/// dependencies:
///   - other-skill
/// ---
///
/// # Skill Title
///
/// Instructions body...
/// ```
pub fn parse_skill_md(content: &str) -> Option<SkillDefinition> {
    let content = content.trim();
    // Must start with frontmatter delimiter
    let rest = content.strip_prefix("---")?;

    // Find closing ---
    let (frontmatter_str, body) = rest.split_once("---")?;

    let frontmatter: SkillFrontmatter = serde_yaml::from_str(frontmatter_str).ok()?;
    let name = frontmatter.name?;

    Some(SkillDefinition {
        name,
        description: frontmatter.description.unwrap_or_default(),
        version: frontmatter.version.unwrap_or_else(|| "1.0".into()),
        body: body.trim().to_string(),
        tools: frontmatter.tools,
        dependencies: frontmatter.dependencies,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_basic_skill() {
        let content = r#"---
name: test-skill
description: A test skill
version: 1.0
---

# Test Skill

These are the instructions.
"#;
        let skill = parse_skill_md(content).unwrap();
        assert_eq!(skill.name, "test-skill");
        assert_eq!(skill.description, "A test skill");
        assert_eq!(skill.version, "1.0");
        assert!(skill.body.contains("# Test Skill"));
        assert!(skill.body.contains("instructions"));
    }

    #[test]
    fn test_parse_skill_with_tools() {
        let content = r#"---
name: code-reviewer
description: Review code
version: "2.0"
tools:
  - bash
  - read
dependencies:
  - git
---

# Code Reviewer

Review code changes.
"#;
        let skill = parse_skill_md(content).unwrap();
        assert_eq!(skill.name, "code-reviewer");
        assert_eq!(skill.tools, vec!["bash", "read"]);
        assert_eq!(skill.dependencies, vec!["git"]);
    }

    #[test]
    fn test_parse_missing_name() {
        let content = r#"---
description: No name here
---

Body
"#;
        assert!(parse_skill_md(content).is_none());
    }

    #[test]
    fn test_parse_no_frontmatter() {
        assert!(parse_skill_md("# Just a heading").is_none());
    }

    #[test]
    fn test_parse_default_version() {
        let content = r#"---
name: minimal-skill
---

Body only
"#;
        let skill = parse_skill_md(content).unwrap();
        assert_eq!(skill.name, "minimal-skill");
        assert_eq!(skill.version, "1.0");
        assert_eq!(skill.description, "");
    }

    #[test]
    fn test_parse_yaml_quoted_strings() {
        let content = r#"---
name: "quoted-skill"
description: "A skill with quotes"
version: "3.0"
---

Body
"#;
        let skill = parse_skill_md(content).unwrap();
        assert_eq!(skill.name, "quoted-skill");
        assert_eq!(skill.description, "A skill with quotes");
        assert_eq!(skill.version, "3.0");
    }

    #[test]
    fn test_parse_empty_tools_and_deps() {
        let content = r#"---
name: simple-skill
---

Just a body.
"#;
        let skill = parse_skill_md(content).unwrap();
        assert!(skill.tools.is_empty());
        assert!(skill.dependencies.is_empty());
    }
}
