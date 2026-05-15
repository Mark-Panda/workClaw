# OpenSpec for workClaw

## Overview

workClaw is an AI Agent platform built around the **herness** agent engine. It provides a complete environment for creating, managing, and monitoring AI agents with visual rule chain editing, kanban project management, streaming chat, and comprehensive logging.

## Spec Index

| Spec | Description |
|------|-------------|
| [herness-agent-engine](specs/herness-agent-engine.md) | Agent runtime, LLM providers, MCP, skills, orchestrator |
| [herness-rule-engine](specs/herness-rule-engine.md) | Rule DSL, execution engine, nodes, interceptors, cache |
| [herness-api-server](specs/herness-api-server.md) | REST API, WebSocket, JWT auth |
| [workclaw-frontend](specs/workclaw-frontend.md) | React SPA pages, components, state management |
| [database-schema](specs/database-schema.md) | SQLite schema, migrations, models |
| [deployment](specs/deployment.md) | Docker, nginx, environment config |

## Development Workflow

1. **Spec first**: Write/update the spec before coding
2. **TDD**: Red-Green-Refactor cycle per spec requirement
3. **Verify**: `cargo build && cargo test && cargo clippy -- -D warnings`
4. **Frontend**: `pnpm build && pnpm test`
5. **Commit**: Conventional commits referencing spec sections
