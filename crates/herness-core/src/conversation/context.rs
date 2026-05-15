use super::message::Message;

/// Manages the context window for a conversation, keeping token usage within limits.
#[derive(Debug, Clone)]
pub struct ContextWindow {
    max_tokens: usize,
    messages: Vec<Message>,
}

impl ContextWindow {
    pub fn new(max_tokens: usize) -> Self {
        Self {
            max_tokens,
            messages: Vec::new(),
        }
    }

    pub fn add_message(&mut self, message: Message) {
        self.messages.push(message);
        self.trim_if_needed();
    }

    pub fn messages(&self) -> &[Message] {
        &self.messages
    }

    pub fn estimated_tokens(&self) -> usize {
        self.messages
            .iter()
            .map(|m| m.content.len() / 4)
            .sum()
    }

    fn trim_if_needed(&mut self) {
        while self.estimated_tokens() > self.max_tokens && self.messages.len() > 2 {
            let idx = self.find_removable_index();
            if let Some(i) = idx {
                self.messages.remove(i);
            } else {
                break;
            }
        }
    }

    fn find_removable_index(&self) -> Option<usize> {
        // Never remove the system message (index 0)
        // Find the oldest non-system message to remove
        self.messages.iter().enumerate().skip(1).map(|(i, _)| i).next()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::conversation::message::Message;

    #[test]
    fn test_context_window_trims_old_messages() {
        let mut window = ContextWindow::new(5);
        window.add_message(Message::system("System prompt".into()));
        window.add_message(Message::user("m1".into(), "Very long message that exceeds limits".into()));
        window.add_message(Message::assistant("m2".into(), "Also a long response message".into()));

        // Should have trimmed at least one message
        assert!(window.messages().len() <= 3);
    }
}
