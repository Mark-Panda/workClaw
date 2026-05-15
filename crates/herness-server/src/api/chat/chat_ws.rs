use axum::extract::ws::{Message, WebSocket};

/// Handle WebSocket upgrade for streaming chat.
/// This is a placeholder for the real streaming chat implementation.
pub async fn handle_chat_ws(mut socket: WebSocket) {
    while let Some(Ok(msg)) = socket.recv().await {
        match msg {
            Message::Text(text) => {
                // Echo for now; real impl would stream LLM tokens
                let _ = socket
                    .send(Message::Text(format!("echo: {}", text).into()))
                    .await;
            }
            Message::Close(_) => break,
            _ => {}
        }
    }
}
