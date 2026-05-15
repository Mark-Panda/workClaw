use crate::agent::skill::{SkillDefinition, SkillRegistry};
use crate::skill_runtime::parser::parse_skill_md;
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};

/// A runtime registry that scans directories for SKILL.md files and loads them.
pub struct SkillRuntimeRegistry {
    skills: SkillRegistry,
    /// Map from skill name to file path for hot-reload support
    sources: HashMap<String, PathBuf>,
    /// Base directories scanned
    scan_dirs: Vec<PathBuf>,
}

impl SkillRuntimeRegistry {
    pub fn new() -> Self {
        Self {
            skills: SkillRegistry::new(),
            sources: HashMap::new(),
            scan_dirs: Vec::new(),
        }
    }

    /// Add a directory to scan for SKILL.md files.
    pub fn add_scan_dir(&mut self, dir: impl Into<PathBuf>) {
        self.scan_dirs.push(dir.into());
    }

    /// Scan all registered directories and load SKILL.md files.
    /// Each subdirectory containing a SKILL.md file is a skill.
    pub fn scan(&mut self) -> anyhow::Result<usize> {
        let mut count = 0;
        for dir in &self.scan_dirs.clone() {
            count += self.scan_directory(dir)?;
        }
        Ok(count)
    }

    fn scan_directory(&mut self, dir: &Path) -> anyhow::Result<usize> {
        if !dir.is_dir() {
            return Ok(0);
        }

        let mut count = 0;
        for entry in fs::read_dir(dir)? {
            let entry = entry?;
            let path = entry.path();

            if path.is_dir() {
                // Check for SKILL.md directly in this directory
                let skill_md = path.join("SKILL.md");
                if skill_md.exists() {
                    if let Some(skill) = self.load_skill_file(&skill_md) {
                        let name = skill.name.clone();
                        self.sources.insert(name.clone(), skill_md);
                        self.skills.register(skill);
                        count += 1;
                    }
                } else {
                    // Recurse into subdirectories
                    count += self.scan_directory(&path)?;
                }
            }
        }
        Ok(count)
    }

    fn load_skill_file(&self, path: &Path) -> Option<SkillDefinition> {
        let content = fs::read_to_string(path).ok()?;
        parse_skill_md(&content)
    }

    /// Register a skill directly (without scanning disk).
    pub fn register(&mut self, skill: SkillDefinition) {
        self.skills.register(skill);
    }

    /// Get a skill by name.
    pub fn get(&self, name: &str) -> Option<&SkillDefinition> {
        self.skills.get(name)
    }

    /// List all loaded skills.
    pub fn list(&self) -> &[SkillDefinition] {
        self.skills.list()
    }

    /// Build a combined system prompt from all skills.
    pub fn to_system_prompt(&self) -> String {
        self.skills.to_system_prompt()
    }

    /// Reload a specific skill from disk.
    pub fn reload(&mut self, name: &str) -> anyhow::Result<()> {
        let path = self
            .sources
            .get(name)
            .cloned()
            .ok_or_else(|| anyhow::anyhow!("Skill '{}' not loaded from disk", name))?;

        let skill = self
            .load_skill_file(&path)
            .ok_or_else(|| anyhow::anyhow!("Failed to parse SKILL.md for '{}'", name))?;

        // Rebuild registry, replacing the old version
        let mut new_registry = SkillRegistry::new();
        for existing in self.skills.list() {
            if existing.name != name {
                new_registry.register(existing.clone());
            }
        }
        new_registry.register(skill);
        self.skills = new_registry;
        Ok(())
    }

    pub fn len(&self) -> usize {
        self.skills.len()
    }

    pub fn is_empty(&self) -> bool {
        self.skills.is_empty()
    }
}

impl Default for SkillRuntimeRegistry {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_register_and_retrieve() {
        let mut registry = SkillRuntimeRegistry::new();
        registry.register(SkillDefinition {
            name: "test".into(),
            description: "desc".into(),
            version: "1.0".into(),
            body: "do stuff".into(),
            tools: vec![],
            dependencies: vec![],
        });
        assert_eq!(registry.len(), 1);
        assert!(registry.get("test").is_some());
    }

    #[test]
    fn test_scan_directory() {
        // Use a temporary directory under target/
        let tmp = std::env::temp_dir().join("herness_test_skills");
        let _ = fs::remove_dir_all(&tmp);
        fs::create_dir_all(&tmp).unwrap();

        let skill_dir = tmp.join("my-skill");
        fs::create_dir(&skill_dir).unwrap();

        let skill_md = skill_dir.join("SKILL.md");
        let content = r#"---
name: my-skill
description: A test skill from disk
version: 1.2
---

# My Skill

Execute this skill when asked to do X.
"#;
        fs::write(&skill_md, content).unwrap();

        let mut registry = SkillRuntimeRegistry::new();
        registry.add_scan_dir(&tmp);
        let count = registry.scan().unwrap();
        assert_eq!(count, 1);

        let skill = registry.get("my-skill").unwrap();
        assert_eq!(skill.name, "my-skill");
        assert_eq!(skill.version, "1.2");
        assert!(skill.body.contains("Execute this skill"));

        // Cleanup
        let _ = fs::remove_dir_all(&tmp);
    }

    #[test]
    fn test_scan_empty_directory() {
        let tmp = std::env::temp_dir().join("herness_test_empty");
        fs::create_dir_all(&tmp).unwrap();
        let mut registry = SkillRuntimeRegistry::new();
        registry.add_scan_dir(&tmp);
        let count = registry.scan().unwrap();
        assert_eq!(count, 0);
        let _ = fs::remove_dir_all(&tmp);
    }

    #[test]
    fn test_scan_nonexistent_directory() {
        let mut registry = SkillRuntimeRegistry::new();
        registry.add_scan_dir("/tmp/__nonexistent_skill_dir_xyz123__");
        let count = registry.scan().unwrap();
        assert_eq!(count, 0);
    }

    #[test]
    fn test_system_prompt_generation() {
        let mut registry = SkillRuntimeRegistry::new();
        registry.register(SkillDefinition {
            name: "a".into(),
            description: "desc".into(),
            version: "1".into(),
            body: "do a".into(),
            tools: vec![],
            dependencies: vec![],
        });
        let prompt = registry.to_system_prompt();
        assert!(prompt.contains("<skills>"));
        assert!(prompt.contains("<name>a</name>"));
    }
}
