pub mod context;
pub mod message;

use crate::conversation::message::Message;
use chrono::{DateTime, Utc};

#[derive(Debug, Clone)]
pub struct Conversation {
    pub id: String,
    pub title: Option<String>,
    pub agent_id: String,
    pub messages: Vec<Message>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

impl Conversation {
    pub fn new(id: String, agent_id: String) -> Self {
        let now = Utc::now();
        Self {
            id,
            title: None,
            agent_id,
            messages: Vec::new(),
            created_at: now,
            updated_at: now,
        }
    }

    pub fn add_message(&mut self, message: Message) {
        self.messages.push(message);
        self.updated_at = Utc::now();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_conversation_new() {
        let conv = Conversation::new("conv-1".into(), "agent-1".into());
        assert_eq!(conv.agent_id, "agent-1");
        assert_eq!(conv.messages.len(), 0);
    }
}
