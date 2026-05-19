use sqlx::sqlite::SqlitePoolOptions;
use sqlx::SqlitePool;

pub type DbPool = SqlitePool;

/// Migration definitions: (id, name, SQL)
const MIGRATIONS: &[(i32, &str, &str)] = &[
    (1, "initial", include_str!("migrations/001_initial.sql")),
    (2, "model_management", include_str!("migrations/002_model_management.sql")),
    (3, "global_mcp", include_str!("migrations/003_global_mcp.sql")),
    (4, "rule_enable_disable", include_str!("migrations/004_rule_enable_disable.sql")),
    (5, "migrations_tracking", include_str!("migrations/005_migrations_tracking.sql")),
];

pub async fn init_db(database_url: &str) -> sqlx::Result<DbPool> {
    let pool = SqlitePoolOptions::new()
        .max_connections(5)
        .connect(database_url)
        .await?;

    // Run migrations 1-3 unconditionally (legacy — they use IF NOT EXISTS)
    // These ran before the _migrations table existed.
    for (id, _name, sql) in MIGRATIONS.iter() {
        if *id <= 3 {
            sqlx::query(sql).execute(&pool).await?;
        }
    }

    // Ensure _migrations table exists (migration 5 creates it, but we need it now)
    sqlx::query(
        "CREATE TABLE IF NOT EXISTS _migrations (
            id INTEGER PRIMARY KEY,
            name TEXT NOT NULL,
            applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )",
    )
    .execute(&pool)
    .await?;

    // Mark legacy migrations as applied if not already tracked
    for (id, name, _sql) in MIGRATIONS.iter() {
        if *id <= 3 {
            let exists: bool = sqlx::query_scalar::<_, i64>(
                "SELECT COUNT(*) FROM _migrations WHERE id = ?",
            )
            .bind(*id)
            .fetch_one(&pool)
            .await?
            > 0;

            if !exists {
                sqlx::query("INSERT INTO _migrations (id, name) VALUES (?, ?)")
                    .bind(*id)
                    .bind(*name)
                    .execute(&pool)
                    .await?;
            }
        }
    }

    // Run remaining migrations with version tracking
    for (id, name, sql) in MIGRATIONS.iter() {
        if *id <= 3 {
            continue; // Already handled above
        }

        let exists: bool = sqlx::query_scalar::<_, i64>(
            "SELECT COUNT(*) FROM _migrations WHERE id = ?",
        )
        .bind(*id)
        .fetch_one(&pool)
        .await?
        > 0;

        if !exists {
            sqlx::query(sql).execute(&pool).await?;
            sqlx::query("INSERT INTO _migrations (id, name) VALUES (?, ?)")
                .bind(*id)
                .bind(*name)
                .execute(&pool)
                .await?;
        }
    }

    Ok(pool)
}
