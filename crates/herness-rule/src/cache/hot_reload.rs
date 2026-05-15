use notify::{Event, RecommendedWatcher, RecursiveMode, Watcher};
use std::path::Path;
use tokio::sync::mpsc;

pub struct HotReload {
    watcher: Option<RecommendedWatcher>,
}

impl HotReload {
    pub fn new() -> Self {
        Self { watcher: None }
    }

    pub fn watch<F>(&mut self, path: &Path, on_change: F) -> anyhow::Result<()>
    where
        F: Fn(Event) + Send + 'static,
    {
        let (tx, mut rx) = mpsc::channel::<notify::Result<Event>>(128);

        let mut watcher = notify::recommended_watcher(move |res| {
            let _ = tx.blocking_send(res);
        })?;

        watcher.watch(path, RecursiveMode::NonRecursive)?;

        tokio::spawn(async move {
            while let Some(Ok(event)) = rx.recv().await {
                on_change(event);
            }
        });

        self.watcher = Some(watcher);
        Ok(())
    }
}

impl Default for HotReload {
    fn default() -> Self {
        Self::new()
    }
}
