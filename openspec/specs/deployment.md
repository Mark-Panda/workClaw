# Deployment

## Status: Complete

## Overview

Multi-service Docker deployment with Nginx reverse proxy, Rust backend, and optional Redis for distributed mode.

## Architecture

```
┌──────────────────────────────────────────┐
│              Docker Host                 │
│                                          │
│  ┌────────────────┐  ┌────────────────┐  │
│  │   frontend     │  │    backend     │  │
│  │  nginx:alpine  │──┤  debian:slim   │  │
│  │  Port 80       │  │  Port 3000     │  │
│  └────────────────┘  └───────┬────────┘  │
│                              │           │
│                      ┌───────▼────────┐  │
│                      │  SQLite        │  │
│                      │ /data/*.db     │  │
│                      └────────────────┘  │
│                                          │
│  [production profile]                    │
│  ┌────────────────┐                      │
│  │    redis       │                      │
│  │  redis:7-alpine│                      │
│  └────────────────┘                      │
└──────────────────────────────────────────┘
```

## Docker Images

### Backend (Dockerfile.backend)
```dockerfile
# Stage 1: Build
FROM rust:1.85-slim-bookworm AS builder
WORKDIR /app
COPY . .
RUN cargo build --release

# Stage 2: Runtime
FROM debian:bookworm-slim
COPY --from=builder /app/target/release/herness-server /usr/local/bin/
COPY skills/ /skills/
CMD ["herness-server"]
```

### Frontend (Dockerfile.frontend)
```dockerfile
# Stage 1: Build
FROM node:22-alpine AS builder
WORKDIR /app
COPY frontend/ .
RUN corepack enable && pnpm install --frozen-lockfile && pnpm build

# Stage 2: Serve
FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
```

## Nginx Configuration

```nginx
server {
    listen 80;
    root /usr/share/nginx/html;
    index index.html;

    # SPA fallback
    location / {
        try_files $uri $uri/ /index.html;
    }

    # API reverse proxy
    location /api/ {
        proxy_pass http://backend:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    # WebSocket proxy
    location /ws/ {
        proxy_pass http://backend:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
    }
}
```

## docker-compose.yml

```yaml
version: "3.9"
services:
  backend:
    build:
      context: .
      dockerfile: Dockerfile.backend
    environment:
      - DATABASE_URL=sqlite:/data/herness.db
      - RUST_LOG=info
      - JWT_SECRET=${JWT_SECRET:-change-me-in-production}
    volumes:
      - herness_data:/data
    restart: unless-stopped

  frontend:
    build:
      context: .
      dockerfile: Dockerfile.frontend
    ports:
      - "80:80"
    depends_on:
      - backend
    restart: unless-stopped

  redis:
    image: redis:7-alpine
    restart: unless-stopped
    profiles:
      - production

volumes:
  herness_data:
```

## Environment Variables

| Variable | Service | Default | Description |
|----------|---------|---------|-------------|
| `HOST` | backend | `0.0.0.0` | Listen address |
| `PORT` | backend | `3000` | Listen port |
| `DATABASE_URL` | backend | `sqlite:herness.db` | SQLite or PostgreSQL URL |
| `JWT_SECRET` | backend | (dev default) | JWT signing key |
| `RUST_LOG` | backend | `info` | Log level |
| `OPENAI_API_KEY` | backend | (required) | OpenAI API key |
| `ANTHROPIC_API_KEY` | backend | (required) | Anthropic API key |

## Build Optimization

```toml
[profile.release]
opt-level = "z"     # Optimize for size
lto = true          # Link-time optimization
codegen-units = 1   # Single codegen unit for better optimization
strip = true        # Strip debug symbols
```

## Build Artifacts

| Artifact | Size |
|----------|------|
| Backend binary | ~15MB (stripped) |
| Frontend JS bundle | 265 KB (86 KB gzipped) |
| Frontend CSS bundle | 19 KB (4 KB gzipped) |
| HTML | 0.5 KB |

## Commands

```bash
# Development
cargo run --bin herness-server
cd frontend && pnpm dev

# Production build
docker compose up --build

# Production with Redis
docker compose --profile production up --build

# Verify deployment
curl http://localhost/api/health
```
