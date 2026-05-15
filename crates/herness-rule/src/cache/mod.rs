pub mod hot_reload;

use crate::dsl::types::RuleChain;
use lru::LruCache;
use std::num::NonZero;
use std::sync::Arc;
use tokio::sync::Mutex;

pub struct RuleChainCache {
    cache: Mutex<LruCache<String, Arc<RuleChain>>>,
}

impl RuleChainCache {
    pub fn new(capacity: usize) -> Self {
        let cap = NonZero::new(capacity).unwrap_or(NonZero::new(128).unwrap());
        Self {
            cache: Mutex::new(LruCache::new(cap)),
        }
    }

    pub async fn get(&self, key: &str) -> Option<Arc<RuleChain>> {
        self.cache.lock().await.get(key).cloned()
    }

    pub async fn put(&self, key: String, chain: Arc<RuleChain>) {
        self.cache.lock().await.put(key, chain);
    }

    pub async fn invalidate(&self, key: &str) {
        self.cache.lock().await.pop(key);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::dsl::types::RuleNode;

    #[tokio::test]
    async fn test_cache_put_and_get() {
        let cache = RuleChainCache::new(10);
        let chain = Arc::new(RuleChain {
            chain_id: "test".into(),
            version: "1.0".into(),
            nodes: vec![
                RuleNode {
                    id: "start".into(),
                    node_type: "start".into(),
                    config: Default::default(),
                },
            ],
            edges: vec![],
            interceptor_configs: vec![],
        });
        cache.put("test".into(), chain.clone()).await;
        let retrieved = cache.get("test").await;
        assert!(retrieved.is_some());
    }

    #[tokio::test]
    async fn test_cache_invalidate() {
        let cache = RuleChainCache::new(10);
        let chain = Arc::new(RuleChain {
            chain_id: "test".into(),
            version: "1.0".into(),
            nodes: vec![],
            edges: vec![],
            interceptor_configs: vec![],
        });
        cache.put("test".into(), chain).await;
        cache.invalidate("test").await;
        assert!(cache.get("test").await.is_none());
    }
}
