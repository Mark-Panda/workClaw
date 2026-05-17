use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::Json;
use serde::Serialize;
use std::path::Path;

use crate::config::get_skills_dir;

#[derive(Debug, Serialize)]
pub struct SkillItem {
    pub name: String,
    pub description: String,
    pub version: String,
    pub size: u64,
}

pub async fn list_skills() -> Result<impl IntoResponse, StatusCode> {
    let skills_dir = get_skills_dir();
    tracing::info!("skill list: skills_dir={}", skills_dir.display());

    if !skills_dir.is_dir() {
        tracing::info!("skill list: skills dir does not exist, returning empty");
        return Ok(Json(serde_json::json!({ "skills": [] })));
    }

    let mut skills: Vec<SkillItem> = Vec::new();

    if let Ok(entries) = std::fs::read_dir(&skills_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                let skill_md = path.join("SKILL.md");
                if skill_md.exists() {
                    let name = path.file_name().unwrap_or_default().to_string_lossy().to_string();
                    let size = dir_size(&path);
                    let (description, version) = parse_skill_info(&skill_md);
                    skills.push(SkillItem { name, description, version, size });
                }
            }
        }
    }

    skills.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(Json(serde_json::json!({ "skills": skills })))
}

fn dir_size(path: &Path) -> u64 {
    let mut total = 0;
    if let Ok(entries) = std::fs::read_dir(path) {
        for entry in entries.flatten() {
            if let Ok(meta) = entry.metadata() {
                if meta.is_file() {
                    total += meta.len();
                }
                if meta.is_dir() {
                    total += dir_size(&entry.path());
                }
            }
        }
    }
    total
}

fn parse_skill_info(skill_md: &Path) -> (String, String) {
    let content = std::fs::read_to_string(skill_md).unwrap_or_default();
    let mut description = String::new();
    let mut version = "0.1.0".to_string();
    let mut in_frontmatter = false;
    let mut started = false;

    for line in content.lines() {
        if line.trim() == "---" {
            if !started {
                started = true;
                in_frontmatter = true;
                continue;
            } else if in_frontmatter {
                in_frontmatter = false;
                continue;
            }
        }
        if in_frontmatter {
            if let Some(value) = line.strip_prefix("description:") {
                description = value.trim().to_string();
            }
            if let Some(value) = line.strip_prefix("version:") {
                version = value.trim().to_string();
            }
        }
    }

    (description, version)
}
