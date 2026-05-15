use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExecutionEvent {
    pub chain_id: String,
    pub execution_id: String,
    pub status: String,
    pub input: Option<Value>,
    pub output: Option<Value>,
    pub error: Option<String>,
}

#[async_trait]
pub trait MessageBus: Send + Sync {
    async fn publish(&self, event: ExecutionEvent) -> anyhow::Result<()>;
    async fn subscribe(&self) -> anyhow::Result<tokio::sync::mpsc::Receiver<ExecutionEvent>>;
}

pub struct InMemoryBus {
    sender: tokio::sync::broadcast::Sender<ExecutionEvent>,
}

impl InMemoryBus {
    pub fn new(capacity: usize) -> Self {
        let (sender, _) = tokio::sync::broadcast::channel(capacity);
        Self { sender }
    }
}

#[async_trait]
impl MessageBus for InMemoryBus {
    async fn publish(&self, event: ExecutionEvent) -> anyhow::Result<()> {
        let _ = self.sender.send(event);
        Ok(())
    }

    async fn subscribe(&self) -> anyhow::Result<tokio::sync::mpsc::Receiver<ExecutionEvent>> {
        let (tx, rx) = tokio::sync::mpsc::channel(256);
        let mut broadcast_rx = self.sender.subscribe();
        tokio::spawn(async move {
            while let Ok(event) = broadcast_rx.recv().await {
                if tx.send(event).await.is_err() {
                    break;
                }
            }
        });
        Ok(rx)
    }
}
