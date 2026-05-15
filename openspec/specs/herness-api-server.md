# herness-api-server

## Status: Phase 4 (Core Complete)

## Overview

Axum-based HTTP API server providing REST endpoints, WebSocket handlers, JWT authentication, and database-backed CRUD operations for the workClaw platform.

## Crate: `herness-server`

### Dependencies
- `herness-common`, `herness-core`, `herness-rule` (internal)
- `axum` 0.8 (web framework, features: ws)
- `tower` / `tower-http` (middleware, CORS, tracing)
- `jsonwebtoken` 9 (JWT authentication)
- `argon2` 0.5 (password hashing)
- `tracing-subscriber` 0.3 (logging)
- `tokio-stream` 0.1 (SSE streaming)

## API Endpoints

### Authentication (no middleware)

```
POST /api/auth/register  { username, email, password } -> { token, user_id }
POST /api/auth/login     { username, password }         -> { token, user_id }
```

- Password hashing: Argon2id via `argon2` crate
- JWT: HS256, 24h expiry, Claims { sub, exp }
- Registration: UNIQUE constraint on username + email
- Login: password verification, returns JWT

### Health Check

```
GET /api/health  -> "OK"
```

### Agent Management (JWT required)

```
GET    /api/agents              List agents for user
POST   /api/agents              Create agent { name, description?, config? }
GET    /api/agents/{id}         Get agent detail
PUT    /api/agents/{id}         Update agent { name?, description?, config? }
DELETE /api/agents/{id}         Delete agent (returns 404/204)
POST   /api/agents/{id}/start   Start agent (stopped -> running)
POST   /api/agents/{id}/stop    Stop agent (running -> stopped)
```

- All agent endpoints validate user ownership via JWT Claims
- Config stored as JSON string in DB
- Start/stop enforces state transition (CONFLICT on invalid state)

### Rule Management (JWT required)

```
GET    /api/rules                    List rules
POST   /api/rules                    Create rule
GET    /api/rules/{id}               Get rule detail
PUT    /api/rules/{id}               Update rule
DELETE /api/rules/{id}               Delete rule
POST   /api/rules/{id}/execute       Execute rule chain
POST   /api/rules/validate           Validate DSL
GET    /api/rules/{id}/export        Export as JSON
POST   /api/rules/import             Import from JSON
```

### Chat (JWT required)

```
POST   /api/chat/send                Send message (non-streaming)
GET    /api/chat/conversations       List conversations
GET    /api/chat/conversations/{id}  Get conversation with messages
DELETE /api/chat/conversations/{id}  Delete conversation
```

### Kanban (JWT required)

```
GET    /api/kanban/boards                 List boards
POST   /api/kanban/boards                 Create board
GET    /api/kanban/boards/{id}            Get board with columns
PUT    /api/kanban/boards/{id}            Update board
DELETE /api/kanban/boards/{id}            Delete board (cascade)
POST   /api/kanban/boards/{id}/columns   Create column
PUT    /api/kanban/columns/{id}           Update column
DELETE /api/kanban/columns/{id}           Delete column (cascade)
GET    /api/kanban/columns/{id}/tasks     List tasks in column
POST   /api/kanban/columns/{id}/tasks     Create task
GET    /api/kanban/tasks/{id}             Get task detail
PUT    /api/kanban/tasks/{id}             Update task
DELETE /api/kanban/tasks/{id}             Delete task
PATCH  /api/kanban/tasks/{id}/move        Move task between columns
```

### Logs (JWT required)

```
GET    /api/logs            Paginated log list (query: level, source, page, limit)
GET    /api/logs/{id}       Single log entry
GET    /api/logs/stream     SSE real-time log stream (5s heartbeat)
GET    /api/logs/export     JSON export
```

## WebSocket

### Endpoints

| Path | Protocol | Description |
|------|----------|-------------|
| `/ws/chat` | WebSocket | Streaming LLM chat |
| `/ws/rules` | WebSocket | Rule execution real-time feedback |

### Message Format

```json
// Client -> Server
{"type": "chat_send", "conversation_id": "...", "content": "..."}
{"type": "rule_execute", "chain_id": "...", "input": {}}

// Server -> Client
{"type": "chat_token", "conversation_id": "...", "token": "..."}
{"type": "chat_done", "conversation_id": "...", "full_text": "..."}
{"type": "chat_tool_call", "tool_name": "...", "args": {}}
{"type": "chat_tool_result", "result": {}}
{"type": "chat_error", "error": "..."}
{"type": "rule_node_enter", "execution_id": "...", "node_id": "...", "node_type": "..."}
{"type": "rule_node_exit", "execution_id": "...", "node_id": "...", "output": {}}
{"type": "rule_complete", "execution_id": "...", "result": {}}
{"type": "rule_error", "execution_id": "...", "node_id": "...", "error": "..."}
```

### Session Management
- WsSession: id (UUID), user_id (Optional), socket (Arc<Mutex<WebSocket>>)
- 30s heartbeat ping/pong
- Auto cleanup on disconnect

## Authentication Flow

```
1. Client POST /api/auth/register -> Argon2 hash -> INSERT user -> JWT encode -> return token
2. Client POST /api/auth/login -> SELECT password_hash -> Argon2 verify -> JWT encode -> return token
3. Client attaches Authorization: Bearer <token>
4. auth_middleware: extract Bearer -> verify JWT -> inject Claims extension
5. Handler: Extension<Claims> -> get user_id -> authorize DB operations
6. 401 response -> frontend interceptor -> clear token -> redirect /login
```

## Configuration

| Env Var | Default | Description |
|---------|---------|-------------|
| `HOST` | `0.0.0.0` | Listen address |
| `PORT` | `3000` | Listen port |
| `DATABASE_URL` | `sqlite:herness.db` | Database connection string |
| `JWT_SECRET` | `dev-secret-...` | JWT signing secret |
| `RUST_LOG` | `info` | Tracing log level |

## Test Coverage

| Test | Status |
|------|--------|
| Health check endpoint | pass |
| JWT create/verify roundtrip | pass |
| JWT verify invalid token | pass |
| JWT verify wrong secret | pass |
| Register endpoint | pass |

## Verification

```bash
cargo test -p herness-server  # 5 tests
cargo clippy -p herness-server -- -D warnings
```
