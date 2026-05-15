use sqlx::sqlite::SqlitePoolOptions;
use sqlx::SqlitePool;

pub type DbPool = SqlitePool;

pub async fn init_db(database_url: &str) -> sqlx::Result<DbPool> {
    let pool = SqlitePoolOptions::new()
        .max_connections(5)
        .connect(database_url)
        .await?;

    sqlx::query(include_str!("migrations/001_initial.sql"))
        .execute(&pool)
        .await?;

    Ok(pool)
}
