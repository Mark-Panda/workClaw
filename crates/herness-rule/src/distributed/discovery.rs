/// Placeholder for service discovery in distributed mode.
pub struct Discovery;

impl Discovery {
    pub fn new() -> Self {
        Self
    }
}

impl Default for Discovery {
    fn default() -> Self {
        Self::new()
    }
}
