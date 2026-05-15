use axum::extract::ws::WebSocket;
use std::sync::Arc;
use tokio::sync::Mutex;

/// Represents a single WebSocket connection session.
pub struct WsSession {
    pub id: String,
    pub user_id: Option<String>,
    pub socket: Arc<Mutex<WebSocket>>,
}

impl WsSession {
    pub fn new(id: String, socket: WebSocket) -> Self {
        Self {
            id,
            user_id: None,
            socket: Arc::new(Mutex::new(socket)),
        }
    }

    pub fn with_user(mut self, user_id: String) -> Self {
        self.user_id = Some(user_id);
        self
    }
}
