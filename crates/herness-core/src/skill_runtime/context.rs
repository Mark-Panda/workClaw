use std::collections::HashMap;
use std::path::PathBuf;

/// Execution context for skill runtime.
///
/// Carries environment variables, working directory, and task-specific
/// metadata that skills can access during execution.
#[derive(Debug, Clone, Default)]
pub struct ExecutionContext {
    env: HashMap<String, String>,
    working_dir: Option<PathBuf>,
    /// Task-specific metadata
    metadata: HashMap<String, String>,
    /// The current conversation/task id
    task_id: Option<String>,
}

impl ExecutionContext {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn with_env(mut self, key: impl Into<String>, value: impl Into<String>) -> Self {
        self.env.insert(key.into(), value.into());
        self
    }

    pub fn with_working_dir(mut self, dir: impl Into<PathBuf>) -> Self {
        self.working_dir = Some(dir.into());
        self
    }

    pub fn with_task_id(mut self, id: impl Into<String>) -> Self {
        self.task_id = Some(id.into());
        self
    }

    pub fn with_metadata(mut self, key: impl Into<String>, value: impl Into<String>) -> Self {
        self.metadata.insert(key.into(), value.into());
        self
    }

    pub fn env(&self) -> &HashMap<String, String> {
        &self.env
    }

    pub fn working_dir(&self) -> Option<&PathBuf> {
        self.working_dir.as_ref()
    }

    pub fn task_id(&self) -> Option<&str> {
        self.task_id.as_deref()
    }

    pub fn metadata(&self) -> &HashMap<String, String> {
        &self.metadata
    }

    /// Get an environment variable value.
    pub fn get_env(&self, key: &str) -> Option<&str> {
        self.env.get(key).map(|s| s.as_str())
    }

    /// Get a metadata value.
    pub fn get_metadata(&self, key: &str) -> Option<&str> {
        self.metadata.get(key).map(|s| s.as_str())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_execution_context() {
        let ctx = ExecutionContext::new()
            .with_env("KEY", "value")
            .with_working_dir("/tmp")
            .with_task_id("task-1")
            .with_metadata("source", "test");
        assert_eq!(ctx.working_dir(), Some(&PathBuf::from("/tmp")));
        assert_eq!(ctx.task_id(), Some("task-1"));
        assert_eq!(ctx.get_env("KEY"), Some("value"));
        assert_eq!(ctx.get_metadata("source"), Some("test"));
    }

    #[test]
    fn test_empty_context() {
        let ctx = ExecutionContext::new();
        assert!(ctx.working_dir().is_none());
        assert!(ctx.task_id().is_none());
        assert!(ctx.env().is_empty());
    }
}
