use std::io;

#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("Not found: {0}")]
    NotFound(String),

    #[error("Validation error: {0}")]
    Validation(String),

    #[error("Internal error: {0}")]
    Internal(String),

    #[error("Database error: {0}")]
    Database(#[from] sqlx::Error),

    #[error("Serialization error: {0}")]
    Serialization(#[from] serde_json::Error),

    #[error("IO error: {0}")]
    Io(#[from] io::Error),

    #[error("Unauthorized")]
    Unauthorized,

    #[error("Rule execution error: {0}")]
    RuleExecution(String),

    #[error("Already exists: {0}")]
    AlreadyExists(String),
}

pub type AppResult<T> = Result<T, AppError>;
