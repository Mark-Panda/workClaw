# workClaw / herness 技术架构文档

## 目录

1. [整体架构](#1-整体架构)
2. [后端 (Rust Workspace)](#2-后端-rust-workspace)
3. [前端 (React SPA)](#3-前端-react-spa)
4. [数据库设计](#4-数据库设计)
5. [API 设计](#5-api-设计)
6. [WebSocket 协议](#6-websocket-协议)
7. [规则引擎](#7-规则引擎)
8. [部署架构](#8-部署架构)

---

## 1. 整体架构

```
                    Browser
                       │
                ┌──────▼──────┐
                │    Nginx    │  (port 80)
                │  SPA + 反向代理 │
                └──────┬──────┘
                       │
          ┌────────────┼────────────┐
          │ /api/*     │ /ws/*      │
          │ (HTTP)     │ (WebSocket)│
          ▼            ▼            │
┌─────────────────┐                 │
│ herness-server  │  Axum :3000     │
│ REST + WS       │◄────────────────┘
└────────┬────────┘
         │
   ┌─────┴──────┐
   ▼            ▼
┌──────────┐ ┌──────────┐
│herness-  │ │herness-  │
│core      │ │rule      │
│Agent引擎  │ │规则引擎   │
└─────┬─────┘ └─────┬────┘
      │             │
      └──────┬──────┘
             ▼
      ┌──────────────┐
      │herness-common│
      │共享类型/DB/错误│
      └──────┬───────┘
             ▼
      ┌──────────────┐
      │   SQLite     │
      │  (可切PG)     │
      └──────────────┘
```

### 技术选型理由

| 层级 | 技术 | 选型理由 |
|------|------|----------|
| Web框架 | Axum 0.8 | tower生态、原生WebSocket、类型安全提取器 |
| 异步运行时 | Tokio 1 | Rust生态标准，full features |
| 数据库 | SQLite + sqlx 0.8 | 编译期SQL校验、零配置部署、可通过DATABASE_URL切换PG |
| 序列化 | serde + serde_json | 编译期派生宏，零成本抽象 |
| 前端框架 | React 18 | 生态成熟，TypeScript支持完善 |
| 路由 | React Router v6 | 嵌套路由、数据加载、Auth Guard |
| 状态管理 | Zustand 5 | 轻量无boilerplate，比Redux简洁 |
| 服务端状态 | TanStack Query 5 | 缓存/重试/去重/后台刷新 |
| 样式 | TailwindCSS 3 | 原子化CSS，JIT编译 |
| 拖拽 | @dnd-kit | 看板拖拽，现代React拖拽库 |
| 构建工具 | Vite 6 | 极速HMR，ESBuild预构建 |

---

## 2. 后端 (Rust Workspace)

### 2.1 工作空间结构

```
Cargo.toml                    # workspace根
crates/
├── herness-common/           # 共享层：类型、DB模型、错误、迁移
├── herness-core/             # 核心层：Agent引擎、LLM Provider、MCP、编排
├── herness-rule/             # 规则引擎：DSL解析/验证/执行、14+节点、AOP拦截器
└── herness-server/           # 服务层：Axum HTTP API、WebSocket、认证
```

### 2.2 Crate 依赖关系

```
herness-server ──► herness-core ──► herness-common
       │                          ▲
       └────────► herness-rule ───┘
```

### 2.3 各 Crate 职责与关键包

#### herness-common（共享层）

| 包 | 版本 | 用途 |
|----|------|------|
| `tokio` | 1 | 异步运行时 |
| `serde` / `serde_json` | 1 | 序列化/反序列化 |
| `sqlx` | 0.8 | 异步SQL驱动，编译期SQL校验。features: `runtime-tokio`, `sqlite`, `postgres`, `chrono`, `uuid` |
| `uuid` | 1 | UUID v4 生成（主键策略） |
| `chrono` | 0.4 | 时间类型（DateTime\<Utc\>） |
| `thiserror` | 2 | 派生宏 Error trait |

**模块结构：**
```
src/
├── lib.rs          # crate入口，re-export公共类型
├── error.rs        # AppError枚举（NotFound/Validation/Database/...）
├── types.rs        # 公共枚举（AgentStatus/RuleStatus/LogLevel/...）
├── db/
│   ├── mod.rs
│   ├── pool.rs     # init_db() — 初始化连接池 + 运行迁移
│   └── models.rs   # 14个sqlx::FromRow struct（User/Agent/RuleChain/...）
└── utils/
    ├── mod.rs
    └── id.rs       # generate_id() — UUID v4
```

#### herness-core（Agent引擎）

| 包 | 版本 | 用途 |
|----|------|------|
| `herness-common` | path | 共享类型、错误 |
| `async-trait` | 0.1 | 异步trait支持（LLM Provider / MCP） |
| `rmcp` | 0.6 | MCP协议客户端实现 |
| `reqwest` | 0.12 | HTTP客户端，调用LLM API。features: `json`, `rustls-tls`, `stream` |
| `tokio-stream` | 0.1 | Stream适配器 |
| `dashmap` | 6 | 并发HashMap（链缓存、会话管理） |
| `futures` | 0.3 | Stream trait（流式LLM响应） |
| `anyhow` | 1 | 灵活错误处理 |

**模块结构：**
```
src/
├── agent/
│   ├── mod.rs       # Agent struct + AgentConfig
│   ├── skill.rs     # SkillRegistry — SKILL.md解析与注册
│   └── subagent.rs  # Subagent — 子代理生成与管理
├── llm/
│   ├── mod.rs
│   ├── provider.rs  # LlmProvider async trait（chat/chat_stream）
│   ├── openai.rs    # OpenAiProvider — 调用 OpenAI/兼容 API
│   ├── anthropic.rs # AnthropicProvider — 调用 Anthropic Messages API
│   ├── streaming.rs # StreamEvent枚举（Text/ToolCall/Done/Error）
│   └── chat.rs      # ChatCompletionRequest/Message 类型定义
├── conversation/
│   ├── mod.rs       # Conversation struct
│   ├── message.rs   # Message struct + ToolCall + factory方法
│   └── context.rs   # ContextWindow — token估算与裁剪
├── mcp/
│   ├── mod.rs
│   ├── client.rs    # McpClient + McpClientConfig（stdio/sse transport）
│   ├── transport.rs # Transport抽象
│   └── types.rs     # MCP协议类型
├── orchestrator/
│   └── mod.rs       # Orchestrator — 串联Agent+Conversation+LLM+Tools
└── skill_runtime/
    ├── mod.rs
    ├── context.rs    # 技能运行时上下文
    ├── executor.rs   # 技能执行器
    └── registry.rs   # 运行时注册表
```

#### herness-rule（规则引擎）

| 包 | 版本 | 用途 |
|----|------|------|
| `herness-common` | path | 共享错误类型 |
| `rhai` | 1 | 嵌入式脚本引擎（script节点） |
| `cel-interpreter` | 0.7 | CEL表达式求值（condition节点） |
| `notify` | 8 | 文件系统监听（热重载，macOS用kqueue） |
| `lru` | 0.14 | LRU缓存（规则链缓存） |
| `dashmap` | 6 | 并发HashMap |
| `tracing` | 0.1 | 结构化日志 |

**核心Trait定义：**

```rust
// 节点处理器（每个内置节点实现此trait）
#[async_trait]
pub trait NodeHandler: Send + Sync {
    fn node_type(&self) -> &'static str;
    async fn execute(&self, ctx: &mut NodeContext, config: Value) -> AppResult<NodeOutput>;
    fn validate_config(&self, config: &Value) -> Result<(), AppError> { Ok(()) }
}

// AOP拦截器（before/after/on_error 钩子）
#[async_trait]
pub trait Interceptor: Send + Sync {
    fn interceptor_type(&self) -> &'static str;
    async fn before(&self, ctx: &mut ExecutionContext, node_id: &str) -> AppResult<()>;
    async fn after(&self, ctx: &mut ExecutionContext, node_id: &str, result: &NodeOutput) -> AppResult<()>;
    async fn on_error(&self, ctx: &mut ExecutionContext, node_id: &str, error: &AppError) -> AppResult<()>;
}

// 消息总线（可插拔：InMemory / Redis）
#[async_trait]
pub trait MessageBus: Send + Sync {
    async fn publish(&self, event: ExecutionEvent) -> anyhow::Result<()>;
    async fn subscribe(&self) -> anyhow::Result<mpsc::Receiver<ExecutionEvent>>;
}
```

**14个内置节点：**

| 节点 | node_type | 功能 |
|------|-----------|------|
| StartNode | `start` | 入口节点，初始化输入 |
| EndNode | `end` | 终止节点，输出结果 |
| DelayNode | `delay` | 延时执行（毫秒） |
| ConditionNode | `condition` | 条件分支，输出Route(true/false) |
| LoopNode | `loop` | 循环执行子节点 |
| TransformNode | `transform` | 数据转换（JSONata风格） |
| LogNode | `log` | 日志输出节点 |
| RestClientNode | `rest_client` | HTTP REST调用 |
| ScriptNode | `script` | Rhai脚本执行 |
| SubchainNode | `subchain` | 子链调用（递归） |
| ForkNode | `fork` | 并行分叉 |
| JoinNode | `join` | 并行汇合 |
| AssignNode | `assign` | 变量赋值 |
| NotificationNode | `notification` | 通知推送 |

**4个内置拦截器：**

| 拦截器 | 功能 |
|--------|------|
| LoggingInterceptor | 记录节点进入/退出/错误日志 |
| MetricsInterceptor | 计数节点执行次数/错误次数 |
| ValidationInterceptor | 执行前校验（占位） |
| AuthInterceptor | 认证校验（占位） |

**JSON DSL 格式：**

```json
{
  "chain_id": "order-flow",
  "version": "1.0",
  "nodes": [
    {"id": "start", "type": "start", "config": {}},
    {"id": "validate", "type": "transform", "config": {"schema": {}}},
    {"id": "decision", "type": "condition", "config": {
      "expression": "input.amount > 100",
      "true_branch": "fulfill",
      "false_branch": "backorder"
    }},
    {"id": "fulfill", "type": "rest_client", "config": {"url": "...", "method": "POST"}},
    {"id": "backorder", "type": "delay", "config": {"duration_ms": 3600000}},
    {"id": "end", "type": "end", "config": {}}
  ],
  "edges": [
    {"from": "start", "to": "validate"},
    {"from": "validate", "to": "decision"},
    {"from": "decision", "to": "fulfill", "label": "true"},
    {"from": "decision", "to": "backorder", "label": "false"},
    {"from": "fulfill", "to": "end"},
    {"from": "backorder", "to": "end"}
  ],
  "interceptors": [
    {"type": "logging"},
    {"type": "metrics"}
  ]
}
```

#### herness-server（API服务）

| 包 | 版本 | 用途 |
|----|------|------|
| `herness-common/core/rule` | path | 三层依赖 |
| `axum` | 0.8 | Web框架。features: `ws`（WebSocket） |
| `tower` / `tower-http` | 0.5 / 0.6 | 中间件层。features: `cors`, `trace`, `fs` |
| `jsonwebtoken` | 9 | JWT签发与验证 |
| `argon2` | 0.5 | 密码哈希（Argon2id） |
| `tracing-subscriber` | 0.3 | 结构化日志初始化 |
| `tokio-stream` | 0.1 | Stream适配器（SSE） |

---

## 3. 前端 (React SPA)

### 3.1 技术栈

| 类别 | 包 | 版本 | 用途 |
|------|-----|------|------|
| 框架 | `react` / `react-dom` | 18.3 | UI框架 |
| 路由 | `react-router-dom` | 6.30 | 客户端路由 |
| 状态管理 | `zustand` | 5.0 | 全局状态（6个slice） |
| 服务端状态 | `@tanstack/react-query` | 5.75 | 异步数据缓存/刷新 |
| HTTP | `axios` | 1.9 | HTTP请求 + 拦截器（JWT注入/401重定向） |
| 拖拽 | `@dnd-kit/core` + `sortable` + `utilities` | 6.3 / 10.0 / 3.2 | 看板拖拽 |
| 样式 | `tailwindcss` | 3.4 | 原子化CSS |
| 构建 | `vite` | 6.3 | 构建工具 |
| 类型检查 | `typescript` | 5.8 | 类型系统 |

### 3.2 测试工具

| 包 | 版本 | 用途 |
|----|------|------|
| `vitest` | 3.1 | 单元/组件测试 |
| `@testing-library/react` | 16.3 | React组件渲染测试 |
| `@testing-library/user-event` | 14.6 | 用户交互模拟 |
| `jsdom` | 26.1 | 浏览器环境模拟 |
| `msw` | 2.7 | API Mock（Service Worker） |
| `@playwright/test` | 1.52 | E2E浏览器自动化 |

### 3.3 目录结构

```
frontend/src/
├── main.tsx              # 入口：QueryClientProvider + BrowserRouter
├── App.tsx               # 路由定义（所有页面+Lazy Loading）
├── api/                  # API层
│   ├── client.ts         # Axios实例（JWT拦截器 + 401重定向）
│   ├── auth.ts           # POST /api/auth/login|register
│   ├── agents.ts         # CRUD /api/agents
│   ├── rules.ts          # CRUD /api/rules + execute/validate
│   ├── chat.ts           # /api/chat/send|conversations
│   ├── kanban.ts         # CRUD /api/kanban/boards|columns|tasks
│   └── logs.ts           # GET /api/logs + SSE stream
├── store/                # Zustand状态管理
│   ├── index.ts          # 组合6个slice的root store
│   └── slices/
│       ├── authSlice.ts  # user/token/isAuthenticated/setAuth/logout
│       ├── agentSlice.ts # agents列表/当前agent CRUD
│       ├── ruleSlice.ts  # rules列表/当前rule/DSL编辑
│       ├── chatSlice.ts  # conversations/streamingMessage/appendToken
│       ├── kanbanSlice.ts# boards/columns/tasks/拖拽状态
│       └── logSlice.ts   # logs/filter/实时流追加
├── hooks/                # 自定义Hooks
│   ├── useAuth.ts        # 认证状态hook
│   ├── useWebSocket.ts   # WebSocket连接/重连/心跳
│   ├── useStreamingChat.ts # 流式对话消息处理
│   └── useRuleValidation.ts # 规则DSL实时校验
├── pages/                # 页面组件
│   ├── Login/            # 登录页
│   ├── Dashboard/        # 仪表盘
│   ├── Chat/             # 流式对话页 + MessageList/ChatInput/MessageBubble
│   ├── Agents/           # Agent列表 + Agent编辑器
│   ├── Rules/            # 规则列表 + 规则编辑器（JSON/可视化双模式）
│   ├── Kanban/           # 看板页 + BoardColumn/TaskCard/TaskEditor
│   └── Logs/             # 日志页 + LogTable/LogFilter/LogStream(SSE)
├── components/           # 通用组件
│   ├── layout/           # AppLayout/Sidebar/Header/Breadcrumb
│   ├── guards/           # AuthGuard（路由守卫）
│   └── common/           # Button/Modal/Spinner/Pagination/ConfirmDialog
├── types/                # TypeScript类型定义
│   ├── auth.ts / agent.ts / rule.ts / chat.ts / kanban.ts / log.ts
└── styles/
    └── index.css          # TailwindCSS入口
```

### 3.4 路由设计

| 路由 | 页面 | AuthGuard | 说明 |
|------|------|-----------|------|
| `/login` | LoginPage | 否 | 登录表单 |
| `/dashboard` | DashboardPage | 是 | 仪表盘 |
| `/chat/:id?` | ChatPage | 是 | 流式对话（可选指定会话ID） |
| `/agents` | AgentListPage | 是 | Agent列表 |
| `/agents/:id` | AgentEditorPage | 是 | Agent创建/编辑 |
| `/rules` | RuleListPage | 是 | 规则列表 |
| `/rules/:id` | RuleEditorPage | 是 | 规则编辑（JSON + 可视化画布） |
| `/kanban/:boardId?` | KanbanBoardPage | 是 | 看板（可选指定面板ID） |
| `/logs` | LogsPage | 是 | 系统日志（分页 + SSE实时流） |

### 3.5 状态管理架构

```
Zustand Store
├── authSlice
│   ├── user / token / isAuthenticated
│   └── setAuth() / logout()
├── agentSlice
│   ├── agents[] / currentAgent
│   └── fetchAgents() / createAgent() / updateAgent() / deleteAgent()
├── ruleSlice
│   ├── rules[] / currentRule / dslJson
│   └── fetchRules() / saveRule() / executeRule()
├── chatSlice
│   ├── conversations[] / streamingMessage / isStreaming
│   └── sendMessage() / appendStreamToken() / clearStream()
├── kanbanSlice
│   ├── boards[] / columns[] / tasks[]
│   └── moveTask() / createTask() / updateTask()
└── logSlice
    ├── logs[] / total / filter
    └── fetchLogs() / appendLogEntry() / setFilter()
```

### 3.6 数据流

```
用户操作 → Zustand Action → Axios API Client → Backend REST/WS
                                              ↓
                              TanStack Query 缓存 ← 响应数据
                                              ↓
                              Zustand State 更新 → React Re-render
```

---

## 4. 数据库设计

### 4.1 表结构（13张表）

```
users
  id TEXT PK, username TEXT UNIQUE, email TEXT UNIQUE,
  password_hash TEXT, created_at, updated_at

agents
  id TEXT PK, name TEXT, description TEXT, config_json TEXT,
  status TEXT, user_id FK→users, created_at, updated_at

agent_skills
  id TEXT PK, agent_id FK→agents ON DELETE CASCADE,
  skill_name TEXT, skill_path TEXT, config_json TEXT, enabled BOOL

agent_mcp_servers
  id TEXT PK, agent_id FK→agents ON DELETE CASCADE,
  name TEXT, transport TEXT, command TEXT, args_json TEXT,
  url TEXT, env_json TEXT, enabled BOOL

rule_chains
  id TEXT PK, name TEXT, description TEXT, dsl_json TEXT,
  canvas_json TEXT, version INT, status TEXT,
  user_id FK→users, created_at, updated_at

rule_execution_logs
  id TEXT PK, chain_id FK→rule_chains, status TEXT,
  input_json TEXT, output_json TEXT, error TEXT,
  started_at, completed_at, duration_ms, user_id FK→users, created_at

rule_node_executions
  id TEXT PK, execution_id FK→rule_execution_logs,
  node_id TEXT, node_type TEXT, input_json TEXT, output_json TEXT,
  error TEXT, started_at, completed_at, duration_ms

conversations
  id TEXT PK, title TEXT, agent_id FK→agents,
  user_id FK→users, created_at, updated_at

messages
  id TEXT PK, conversation_id FK→conversations ON DELETE CASCADE,
  role TEXT, content TEXT, tool_calls_json TEXT,
  tool_call_id TEXT, token_count INT, created_at

kanban_boards
  id TEXT PK, name TEXT, description TEXT,
  user_id FK→users, created_at, updated_at

kanban_columns
  id TEXT PK, board_id FK→kanban_boards ON DELETE CASCADE,
  name TEXT, position INT, color TEXT, wip_limit INT, created_at

kanban_tasks
  id TEXT PK, column_id FK→kanban_columns ON DELETE CASCADE,
  title TEXT, description TEXT, priority TEXT, assignee TEXT,
  labels_json TEXT, due_date, position INT, created_at, updated_at

logs
  id TEXT PK, level TEXT, source TEXT, message TEXT,
  context_json TEXT, user_id FK→users, created_at
```

### 4.2 索引（12个）

```sql
agents(user_id)           agent_skills(agent_id)
rule_chains(user_id)      rule_execution_logs(chain_id, user_id)
conversations(user_id, agent_id)      messages(conversation_id)
kanban_columns(board_id)  kanban_tasks(column_id)
logs(level, source, created_at)
```

### 4.3 主键策略

统一使用 UUID v4 字符串，Go兼容性，比自增ID更适合分布式场景。

---

## 5. API 设计

### 5.1 REST端点一览

```
认证（无需token）
  POST /api/auth/register    注册用户
  POST /api/auth/login       登录，返回JWT

Agent管理（需token）
  GET    /api/agents                    列表
  POST   /api/agents                    创建
  GET    /api/agents/{id}               详情
  PUT    /api/agents/{id}               更新
  DELETE /api/agents/{id}               删除
  POST   /api/agents/{id}/start         启动
  POST   /api/agents/{id}/stop          停止

规则管理（需token）
  GET    /api/rules                     列表
  POST   /api/rules                     创建
  GET    /api/rules/{id}                详情
  PUT    /api/rules/{id}                更新
  DELETE /api/rules/{id}                删除
  POST   /api/rules/{id}/execute        执行
  POST   /api/rules/validate            校验DSL
  GET    /api/rules/{id}/export         导出JSON
  POST   /api/rules/import              导入JSON

对话（需token）
  POST   /api/chat/send                 发送消息（非流式）
  GET    /api/chat/conversations        会话列表
  GET    /api/chat/conversations/{id}   会话详情（含消息）
  DELETE /api/chat/conversations/{id}   删除会话

看板（需token）
  GET    /api/kanban/boards             面板列表
  POST   /api/kanban/boards             创建面板
  GET    /api/kanban/boards/{id}        面板详情
  PUT    /api/kanban/boards/{id}        更新面板
  DELETE /api/kanban/boards/{id}        删除面板
  POST   /api/kanban/boards/{id}/columns  创建列
  PUT    /api/kanban/columns/{id}       更新列
  DELETE /api/kanban/columns/{id}       删除列
  GET    /api/kanban/columns/{id}/tasks 列下任务列表
  POST   /api/kanban/columns/{id}/tasks 创建任务
  GET    /api/kanban/tasks/{id}         任务详情
  PUT    /api/kanban/tasks/{id}         更新任务
  DELETE /api/kanban/tasks/{id}         删除任务
  PATCH  /api/kanban/tasks/{id}/move    移动任务

日志（需token）
  GET    /api/logs                      分页列表
  GET    /api/logs/{id}                 单条详情
  GET    /api/logs/stream               SSE实时流
  GET    /api/logs/export               JSON导出

健康检查
  GET /api/health                       "OK"
```

### 5.2 认证流程

```
1. POST /api/auth/register → {username, password} → {token, user_id}
2. POST /api/auth/login    → {username, password} → {token, user_id}
3. 后续请求：Authorization: Bearer <token>
4. auth_middleware 验证JWT → 注入 user_id 到 Request Extension
5. 前端401拦截器 → 自动清除token → 重定向 /login
```

---

## 6. WebSocket 协议

### 6.1 端点

| 端点 | 用途 |
|------|------|
| `/ws/chat` | 流式对话（LLM token流） |
| `/ws/rules` | 规则执行实时反馈 |

### 6.2 消息格式

```rust
// 客户端→服务端
enum ClientMessage {
    ChatSend { conversation_id: String, content: String },
    RuleExecute { chain_id: String, input: Value },
}

// 服务端→客户端
enum ServerMessage {
    ChatToken { conversation_id: String, token: String },
    ChatDone { conversation_id: String, full_text: String },
    ChatToolCall { conversation_id: String, tool_name: String, args: Value },
    ChatToolResult { conversation_id: String, result: Value },
    ChatError { conversation_id: String, error: String },
    RuleNodeEnter { execution_id: String, node_id: String, node_type: String },
    RuleNodeExit { execution_id: String, node_id: String, output: Value },
    RuleComplete { execution_id: String, result: Value },
    RuleError { execution_id: String, node_id: String, error: String },
}
```

### 6.3 会话管理

- 每个WebSocket连接创建`WsSession`（id/uuid, user_id, socket）
- 心跳检测（30s interval ping/pong）
- 连接断开自动清理

---

## 7. 规则引擎

### 7.1 执行流程

```
1. 加载 RuleChain（从缓存或DB）
2. 找到 head_node（type="start"）
3. 循环遍历：
   a. 运行 before 拦截器（所有已启用的）
   b. 获取节点handler → 执行 node.execute(ctx, config)
   c. 同步 ctx（variables, node_outputs）
   d. 运行 after 拦截器
   e. 根据 NodeOutput 决定下一节点：
      - Route(target) → 跳转到指定节点
      - Continue      → 按edges进入下一节点
      - Stop          → 结束执行
   f. 若出错：运行 on_error 拦截器 → 终止
4. 返回 ctx.output
```

### 7.2 缓存与热重载

```
RuleChainCache (LRU, 128容量)
    ├── get(key) → Option<Arc<RuleChain>>
    ├── put(key, chain)
    └── invalidate(key)

HotReload (notify v8, macos_kqueue)
    └── 监听 skills/ 目录 → 文件变更 → invalidate 对应缓存
```

### 7.3 分布式支持

```rust
// 可插拔消息总线
trait MessageBus {
    async fn publish(&self, event: ExecutionEvent);
    async fn subscribe(&self) -> Receiver<ExecutionEvent>;
}

// 实现
InMemoryBus   // 单机，broadcast channel
RedisBus      // 分布式，Redis Pub/Sub（待实现）
```

---

## 8. 部署架构

### 8.1 Docker Compose

```
┌─────────────────────────────────────┐
│          docker-compose.yml         │
│                                     │
│  ┌──────────┐    ┌──────────────┐   │
│  │ frontend │    │   backend    │   │
│  │ nginx:alp│    │ debian:slim  │   │
│  │  :80     │───►│   :3000      │   │
│  └──────────┘    └──────┬───────┘   │
│                         │           │
│                 ┌───────▼───────┐   │
│                 │    SQLite     │   │
│                 │  /data/*.db   │   │
│                 └───────────────┘   │
│                                     │
│  [production profile only]          │
│  ┌──────────┐                       │
│  │  redis   │  Redis Pub/Sub        │
│  │  :6379   │  分布式消息总线        │
│  └──────────┘                       │
└─────────────────────────────────────┘
```

### 8.2 多阶段构建

**Dockerfile.backend:**
```
Stage 1: rust:1.85-slim-bookworm
  → cargo build --release
Stage 2: debian:bookworm-slim
  → 复制二进制 + skills/ → 运行
```

**Dockerfile.frontend:**
```
Stage 1: node:22-alpine
  → pnpm install → pnpm build
Stage 2: nginx:alpine
  → 复制 dist/ + nginx.conf → 运行
```

### 8.3 Nginx配置

```nginx
# SPA: try_files 回退到 index.html
location / {
    try_files $uri $uri/ /index.html;
}

# API反向代理
location /api/ {
    proxy_pass http://backend:3000;
}

# WebSocket代理
location /ws/ {
    proxy_pass http://backend:3000;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
}
```

### 8.4 构建产物

| 产物 | 大小 |
|------|------|
| 后端二进制 | ~15MB（strip + LTO + opt-level=z） |
| 前端JS (gzip) | 86.58 KB |
| 前端CSS (gzip) | 4.01 KB |
| HTML | 0.49 KB |
