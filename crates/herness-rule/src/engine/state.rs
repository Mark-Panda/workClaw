#[derive(Debug, Clone, PartialEq)]
pub enum EngineState {
    Idle,
    Running,
    Completed,
    Failed(String),
}
