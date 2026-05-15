use async_trait::async_trait;

use crate::interceptor::Interceptor;

pub struct AuthInterceptor;

#[async_trait]
impl Interceptor for AuthInterceptor {
    fn interceptor_type(&self) -> &'static str {
        "auth"
    }
}
