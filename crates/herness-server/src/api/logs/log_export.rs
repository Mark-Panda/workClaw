use axum::body::Body;
use axum::extract::{Query, State};
use axum::http::{header, StatusCode};
use axum::response::Response;
use axum::Extension;
use serde::Deserialize;
use serde_json::json;
use sqlx::Row;

use super::super::middleware::Claims;
use super::super::router::AppState;

#[derive(Debug, Deserialize)]
pub struct ExportLogsQuery {
    pub chain_id: Option<String>,
    pub status: Option<String>,
}

pub async fn export_logs(
    State(state): State<AppState>,
    Extension(claims): Extension<Claims>,
    Query(query): Query<ExportLogsQuery>,
) -> Response {
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

    sql.push_str(" ORDER BY created_at DESC LIMIT 1000");

    let mut data_query = sqlx::query(&sql);
    for val in &bind_values {
        data_query = data_query.bind(val);
    }

    let rows = match data_query.fetch_all(&state.pool).await {
        Ok(r) => r,
        Err(_) => {
            return Response::builder()
                .status(StatusCode::INTERNAL_SERVER_ERROR)
                .header(header::CONTENT_TYPE, "application/json")
                .body(Body::from(r#"{"error": "Database error"}"#))
                .unwrap();
        }
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

    let body = serde_json::to_string(&logs).unwrap_or_else(|_| "[]".to_string());

    Response::builder()
        .status(StatusCode::OK)
        .header(header::CONTENT_TYPE, "application/json")
        .header(header::CONTENT_DISPOSITION, "attachment; filename=\"logs-export.json\"")
        .body(Body::from(body))
        .unwrap()
}
