use crate::api::chat::chat_ws::handle_chat_ws;
use axum::extract::ws::{WebSocket, WebSocketUpgrade};
use axum::response::IntoResponse;

pub async fn chat_ws_handler(ws: WebSocketUpgrade) -> impl IntoResponse {
    ws.on_upgrade(|socket: WebSocket| handle_chat_ws(socket))
}
