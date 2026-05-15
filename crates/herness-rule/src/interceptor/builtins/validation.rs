use async_trait::async_trait;

use crate::interceptor::Interceptor;

pub struct ValidationInterceptor;

#[async_trait]
impl Interceptor for ValidationInterceptor {
    fn interceptor_type(&self) -> &'static str {
        "validation"
    }
}
