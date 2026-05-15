use herness_common::db::pool::init_db;
use herness_server::api::router::create_router;
use herness_server::config::ServerConfig;
use tokio::net::TcpListener;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    dotenvy::dotenv().ok();
    tracing_subscriber::fmt::init();

    let config = ServerConfig::from_env();

    let pool = init_db(&config.database_url).await?;
    tracing::info!("Database initialized");

    let app = create_router(pool);

    let listener = TcpListener::bind(config.addr()).await?;
    tracing::info!("Server listening on {}", config.addr());

    axum::serve(listener, app).await?;

    Ok(())
}
