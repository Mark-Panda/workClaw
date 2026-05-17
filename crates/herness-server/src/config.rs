use serde::Deserialize;
use std::env;
use std::path::PathBuf;

/// TOML file structure — all fields optional so missing keys fall back to defaults.
#[derive(Debug, Deserialize)]
struct ConfigFile {
    server: Option<ServerSection>,
}

#[derive(Debug, Deserialize)]
struct ServerSection {
    host: Option<String>,
    port: Option<u16>,
    database_url: Option<String>,
    jwt_secret: Option<String>,
    rust_log: Option<String>,
    skills_dir: Option<String>,
}

#[derive(Debug, Clone)]
pub struct ServerConfig {
    pub host: String,
    pub port: u16,
    pub database_url: String,
    pub jwt_secret: String,
    pub rust_log: String,
    pub skills_dir: PathBuf,
}

impl ServerConfig {
    pub fn from_env() -> Self {
        let cfg = Self::load_config_file();

        Self {
            host: env_or("HOST", cfg.host.as_deref().unwrap_or("0.0.0.0")),
            port: env_or_parse("PORT", cfg.port.unwrap_or(3000)),
            database_url: env_or(
                "DATABASE_URL",
                cfg.database_url.as_deref().unwrap_or("sqlite:herness.db"),
            ),
            jwt_secret: env_or(
                "JWT_SECRET",
                cfg.jwt_secret.as_deref().unwrap_or("dev-secret-change-in-production"),
            ),
            rust_log: env_or("RUST_LOG", cfg.rust_log.as_deref().unwrap_or("info")),
            skills_dir: env::var("SKILLS_DIR")
                .map(PathBuf::from)
                .or_else(|_| {
                    cfg.skills_dir
                        .map(PathBuf::from)
                        .ok_or(())
                })
                .unwrap_or_else(|_| PathBuf::from("./skills")),
        }
    }

    fn load_config_file() -> ServerSection {
        let path = env::var("CONFIG_PATH")
            .unwrap_or_else(|_| "config.toml".to_string());

        match std::fs::read_to_string(&path) {
            Ok(content) => match toml::from_str::<ConfigFile>(&content) {
                Ok(cfg) => cfg.server.unwrap_or_default(),
                Err(e) => {
                    tracing::warn!("Failed to parse {path}: {e}, using defaults");
                    ServerSection::default()
                }
            },
            Err(e) => {
                tracing::warn!("Cannot read config file {path}: {e}, using defaults");
                ServerSection::default()
            }
        }
    }

    pub fn addr(&self) -> String {
        format!("{}:{}", self.host, self.port)
    }
}

/// Returns the configured skills directory path.
/// Used by skill API handlers that don't have access to ServerConfig directly.
pub fn get_skills_dir() -> PathBuf {
    env::var("SKILLS_DIR")
        .map(PathBuf::from)
        .unwrap_or_else(|_| {
            // Try to read from config.toml as fallback
            if let Ok(content) = std::fs::read_to_string("config.toml") {
                if let Ok(cfg) = toml::from_str::<ConfigFile>(&content) {
                    if let Some(server) = cfg.server {
                        if let Some(dir) = server.skills_dir {
                            return PathBuf::from(dir);
                        }
                    }
                }
            }
            PathBuf::from("./skills")
        })
}

// --- helpers ---

fn env_or(key: &str, default: impl Into<String>) -> String {
    env::var(key).unwrap_or_else(|_| default.into())
}

fn env_or_parse<T: std::str::FromStr>(key: &str, default: T) -> T {
    env::var(key)
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(default)
}

impl Default for ServerSection {
    fn default() -> Self {
        Self {
            host: None,
            port: None,
            database_url: None,
            jwt_secret: None,
            rust_log: None,
            skills_dir: None,
        }
    }
}
