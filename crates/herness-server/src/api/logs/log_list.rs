use axum::extract::{Query, State};
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::{Extension, Json};
use serde::Deserialize;
use serde_json::json;
use sqlx::Row;

use super::super::middleware::Claims;
use super::super::router::AppState;

#[derive(Debug, Deserialize)]
pub struct ListLogsQuery {
    pub chain_id: Option<String>,
    pub status: Option<String>,
    pub page: Option<u32>,
    pub page_size: Option<u32>,
}

pub async fn list_logs(
    State(state): State<AppState>,
    Extension(claims): Extension<Claims>,
    Query(query): Query<ListLogsQuery>,
) -> impl IntoResponse {
    let page = query.page.unwrap_or(1).max(1);
    let page_size = query.page_size.unwrap_or(20).min(100);
    let offset = (page - 1) * page_size;

    let mut sql = String::from(
        "SELECT id, chain_id, status, input_json, output_json, error, started_at, completed_at, duration_ms, user_id, created_at FROM rule_execution_logs WHERE user_id = ?",
    );
    let mut bind_values: Vec<String> = vec![claims.sub.clone()];

    if let Some(ref chain_id) = query.chain_id {
        sql.push_str(" AND chain_id = ?");
        bind_values.push(chain_id.clone());
    }
    if let Some(ref status) = query.status {
        sql.push_str(" AND status = ?");
        bind_values.push(status.clone());
    }

    // Count query
    let count_sql = sql.replace(
        "SELECT id, chain_id, status, input_json, output_json, error, started_at, completed_at, duration_ms, user_id, created_at",
        "SELECT COUNT(*) as count",
    );

    let mut count_query = sqlx::query_scalar::<_, i64>(&count_sql);
    for val in &bind_values {
        count_query = count_query.bind(val);
    }

    let total = count_query
        .fetch_one(&state.pool)
        .await
        .unwrap_or(0);

    // Data query
    sql.push_str(" ORDER BY created_at DESC LIMIT ? OFFSET ?");

    let mut data_query = sqlx::query(&sql);
    for val in &bind_values {
        data_query = data_query.bind(val);
    }
    data_query = data_query.bind(page_size).bind(offset);

    let rows = match data_query.fetch_all(&state.pool).await {
        Ok(r) => r,
        Err(_) => return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"logs": [], "total": 0, "page": page}))),
    };

    let logs: Vec<serde_json::Value> = rows
        .iter()
        .map(|row| {
            json!({
                "id": row.get::<String, _>(0),
                "chain_id": row.get::<String, _>(1),
                "status": row.get::<String, _>(2),
                "input_json": row.get::<String, _>(3),
                "output_json": row.get::<String, _>(4),
                "error": row.get::<Option<String>, _>(5),
                "started_at": row.get::<String, _>(6),
                "completed_at": row.get::<String, _>(7),
                "duration_ms": row.get::<Option<i64>, _>(8),
                "user_id": row.get::<String, _>(9),
                "created_at": row.get::<String, _>(10),
            })
        })
        .collect();

    (StatusCode::OK, Json(json!({
        "logs": logs,
        "total": total,
        "page": page,
        "page_size": page_size
    })))
}
