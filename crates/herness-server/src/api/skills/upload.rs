use axum::body::Bytes;
use axum::http::{HeaderMap, StatusCode};
use axum::response::IntoResponse;
use axum::Json;
use std::io::Cursor;

use crate::config::get_skills_dir;

pub async fn upload_skill(
    headers: HeaderMap,
    body: Bytes,
) -> Result<impl IntoResponse, StatusCode> {
    if body.is_empty() {
        tracing::warn!("skill upload: empty body");
        return Err(StatusCode::BAD_REQUEST);
    }

    // Get skill name from X-Skill-Name header, fall back to "unnamed"
    let raw_name = headers
        .get("x-skill-name")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("unnamed");

    let skill_name = raw_name
        .strip_suffix(".zip")
        .or_else(|| raw_name.strip_suffix(".ZIP"))
        .unwrap_or(raw_name)
        .trim()
        .to_string();

    if skill_name.is_empty() {
        tracing::warn!("skill upload: empty skill name");
        return Err(StatusCode::BAD_REQUEST);
    }

    let skills_dir = get_skills_dir();
    tracing::info!("skill upload: name={skill_name}, skills_dir={}", skills_dir.display());

    let target_dir = skills_dir.join(&skill_name);
    std::fs::create_dir_all(&target_dir).map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let cursor = Cursor::new(&body[..]);
    let mut archive = zip::ZipArchive::new(cursor).map_err(|_| StatusCode::BAD_REQUEST)?;

    let prefix = common_prefix(&mut archive);

    for i in 0..archive.len() {
        let mut file = archive.by_index(i).map_err(|_| StatusCode::BAD_REQUEST)?;
        let entry_name = file.name().to_string();

        let relative = match &prefix {
            Some(p) => entry_name
                .strip_prefix(p)
                .and_then(|s| s.strip_prefix('/'))
                .unwrap_or(&entry_name),
            None => &entry_name,
        };

        if relative.is_empty() {
            continue;
        }

        let out_path = target_dir.join(relative);

        if entry_name.ends_with('/') || file.is_dir() {
            std::fs::create_dir_all(&out_path).map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
        } else {
            if let Some(parent) = out_path.parent() {
                std::fs::create_dir_all(parent).map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
            }
            let mut out_file =
                std::fs::File::create(&out_path).map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
            std::io::copy(&mut file, &mut out_file)
                .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
        }
    }

    tracing::info!("skill upload: extracted {skill_name} successfully");
    Ok((StatusCode::CREATED, Json(serde_json::json!({ "name": skill_name, "ok": true }))))
}

/// If every entry in the archive shares the same top-level directory, return it.
/// Skips `__MACOSX` and hidden dotfiles.
fn common_prefix(archive: &mut zip::ZipArchive<Cursor<&[u8]>>) -> Option<String> {
    let mut prefix: Option<String> = None;

    for i in 0..archive.len() {
        let Ok(file) = archive.by_index(i) else { continue };
        let name = file.name().to_string();

        if name.starts_with("__MACOSX") || name.starts_with('.') {
            continue;
        }

        let first = name.split('/').next().unwrap_or("").to_string();
        if first.is_empty() {
            continue;
        }

        if !name.contains('/') {
            return None;
        }

        match &prefix {
            None => prefix = Some(first),
            Some(p) if *p != first => return None,
            _ => {}
        }
    }

    prefix
}
