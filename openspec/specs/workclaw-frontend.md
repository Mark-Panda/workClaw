# workClaw Frontend

## Status: Phase 5 (Core Complete)

## Overview

React SPA providing the user interface for workClaw. Features include streaming chat, agent management, visual rule editing (via flowgram.ai), kanban boards with drag-and-drop, and real-time log streaming.

## Tech Stack

| Category | Package | Version |
|----------|---------|---------|
| Framework | react, react-dom | 18.3 |
| Language | typescript | 5.8 |
| Build | vite | 6.3 |
| Routing | react-router-dom | 6.30 |
| State | zustand | 5.0 |
| Server State | @tanstack/react-query | 5.75 |
| HTTP | axios | 1.9 |
| Drag & Drop | @dnd-kit/core, sortable, utilities | 6.3, 10.0, 3.2 |
| CSS | tailwindcss | 3.4 |
| Testing | vitest, @testing-library/react, @playwright/test | 3.1, 16.3, 1.52 |

## Routes

| Path | Page | Auth | Description |
|------|------|------|-------------|
| `/login` | LoginPage | No | Username/password login form |
| `/dashboard` | DashboardPage | Yes | System overview and stats |
| `/chat/:id?` | ChatPage | Yes | Streaming chat with message history |
| `/agents` | AgentListPage | Yes | Agent list with CRUD |
| `/agents/:id` | AgentEditorPage | Yes | Agent create/edit form |
| `/rules` | RuleListPage | Yes | Rule chain list |
| `/rules/:id` | RuleEditorPage | Yes | JSON editor + visual canvas (Phase 6) |
| `/kanban/:boardId?` | KanbanBoardPage | Yes | Kanban board with drag-and-drop |
| `/logs` | LogsPage | Yes | Log viewer with SSE live stream |

## Component Tree

```
<App>
  <BrowserRouter>
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<AuthGuard />}>
        <Route element={<AppLayout />}>
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/chat/:id?" element={<ChatPage />} />
          <Route path="/agents" element={<AgentListPage />} />
          <Route path="/agents/:id" element={<AgentEditorPage />} />
          <Route path="/rules" element={<RuleListPage />} />
          <Route path="/rules/:id" element={<RuleEditorPage />} />
          <Route path="/kanban/:boardId?" element={<KanbanBoardPage />} />
          <Route path="/logs" element={<LogsPage />} />
        </Route>
      </Route>
    </Routes>
  </BrowserRouter>
</App>
```

## State Management (Zustand Slices)

| Slice | Key State | Actions |
|-------|-----------|---------|
| authSlice | user, token, isAuthenticated | setAuth(), logout() |
| agentSlice | agents[], currentAgent | fetchAgents(), create/update/deleteAgent() |
| ruleSlice | rules[], currentRule, dslJson | fetchRules(), saveRule(), executeRule() |
| chatSlice | conversations[], streamingMessage | sendMessage(), appendStreamToken() |
| kanbanSlice | boards[], columns[], tasks[] | moveTask(), create/updateTask() |
| logSlice | logs[], total, filter | fetchLogs(), appendLogEntry(), setFilter() |

## API Client

- Axios instance with baseURL: `/api`
- Request interceptor: injects `Authorization: Bearer <token>` from localStorage
- Response interceptor: on 401 -> clear token -> redirect `/login`
- Vite dev server proxy: `/api` -> `http://localhost:3000`, `/ws` -> `ws://localhost:3000`

## Hooks

| Hook | Purpose |
|------|---------|
| useAuth() | Auth state and login/logout actions |
| useWebSocket(url, options) | WebSocket connection with auto-reconnect |
| useStreamingChat(conversationId) | Chat token streaming via WebSocket |
| useRuleValidation(dsl) | Real-time DSL validation |

## Custom Components

### Layout
- **AppLayout**: Sidebar + Header + Breadcrumb + main content area
- **Sidebar**: Navigation links with icons
- **Header**: User menu, notifications
- **Breadcrumb**: Auto-generated from route

### Common
- **Button**: Primary/secondary/danger variants
- **Modal**: Animated overlay with close
- **Spinner**: Loading indicator
- **Pagination**: Page navigation
- **ConfirmDialog**: Confirmation modal

### Guards
- **AuthGuard**: Redirects to /login if not authenticated (checks localStorage token)

## Pages

### LoginPage
- Username + password form
- Error display for invalid credentials
- Redirect to /dashboard on success

### DashboardPage
- Overview cards (agent count, rule count, recent activity)
- Quick actions

### ChatPage
- Conversation list sidebar
- Message history with MessageBubble components
- ChatInput with send button
- Streaming token display via WebSocket
- Tool call visualization

### AgentListPage / AgentEditorPage
- Table view with name, status, model
- Create/edit form: name, description, model, system prompt, temperature, max tokens
- Start/stop actions with status indicator

### RuleListPage / RuleEditorPage
- Rule chain list with status
- Editor: JSON textarea (Monaco planned) + visual canvas toggle
- Validate button with inline errors
- Execute button with result panel

### KanbanBoardPage
- Board selector
- Column layout with TaskCards
- Drag-and-drop via @dnd-kit
- TaskEditor modal: title, description, priority, assignee, due date
- Column WIP limits

### LogsPage
- LogFilter: level, source, date range
- LogTable: paginated with color-coded levels
- LiveStream toggle: SSE connection with real-time log display
- Export button

## Test Coverage

| Test | Status |
|------|--------|
| App redirects to /login | pass |
| Login page renders | pass |

## Verification

```bash
cd frontend
pnpm build    # tsc -b && vite build (170 modules)
pnpm test     # vitest run (2 tests)
```
