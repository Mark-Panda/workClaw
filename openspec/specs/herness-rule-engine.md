# herness-rule-engine

## Status: Phase 3 (Complete)

## Overview

A stateless, JSON DSL-driven rule engine with AOP (Aspect-Oriented Programming) interceptor architecture, distributed execution support, and hot-reload capability. Designed for visual editing via flowgram.ai canvas.

## Crate: `herness-rule`

### Dependencies
- `herness-common` (shared types, errors)
- `rhai` (embedded scripting)
- `cel-interpreter` (CEL expression evaluation)
- `notify` (filesystem watcher for hot-reload)
- `lru` (LRU cache for chain caching)
- `dashmap` (concurrent HashMap)
- `tracing` (structured logging)

## Core Traits

### NodeHandler
```rust
#[async_trait]
pub trait NodeHandler: Send + Sync {
    fn node_type(&self) -> &'static str;
    async fn execute(&self, ctx: &mut NodeContext, config: Value) -> AppResult<NodeOutput>;
    fn validate_config(&self, config: &Value) -> Result<(), AppError> { Ok(()) }
}
```

### Interceptor
```rust
#[async_trait]
pub trait Interceptor: Send + Sync {
    fn interceptor_type(&self) -> &'static str;
    async fn before(&self, ctx: &mut ExecutionContext, node_id: &str) -> AppResult<()>;
    async fn after(&self, ctx: &mut ExecutionContext, node_id: &str, result: &NodeOutput) -> AppResult<()>;
    async fn on_error(&self, ctx: &mut ExecutionContext, node_id: &str, error: &AppError) -> AppResult<()>;
}
```

### MessageBus
```rust
#[async_trait]
pub trait MessageBus: Send + Sync {
    async fn publish(&self, event: ExecutionEvent) -> anyhow::Result<()>;
    async fn subscribe(&self) -> anyhow::Result<mpsc::Receiver<ExecutionEvent>>;
}
```

## Built-in Nodes (14)

| # | Node | node_type | Description |
|---|------|-----------|-------------|
| 1 | StartNode | `start` | Entry point, initializes input data |
| 2 | EndNode | `end` | Terminal node, sets final output |
| 3 | DelayNode | `delay` | Pauses execution for specified milliseconds |
| 4 | ConditionNode | `condition` | Evaluates expression, routes to true/false branch |
| 5 | LoopNode | `loop` | Iterates over items or repeats N times |
| 6 | TransformNode | `transform` | Data transformation with schema validation |
| 7 | LogNode | `log` | Structured logging within chain execution |
| 8 | RestClientNode | `rest_client` | HTTP REST API calls |
| 9 | ScriptNode | `script` | Rhai script execution |
| 10 | SubchainNode | `subchain` | Recursive sub-chain invocation |
| 11 | ForkNode | `fork` | Parallel execution fork |
| 12 | JoinNode | `join` | Parallel execution join/merge |
| 13 | AssignNode | `assign` | Variable assignment in context |
| 14 | NotificationNode | `notification` | Push notification dispatch |

## Built-in Interceptors (4)

| Interceptor | Type | Hooks | Description |
|-------------|------|------|-------------|
| LoggingInterceptor | `logging` | before/after/on_error | Structured logging via tracing |
| MetricsInterceptor | `metrics` | after/on_error | Atomic counters for executions/errors |
| ValidationInterceptor | `validation` | before | Pre-execution validation |
| AuthInterceptor | `auth` | before | Authentication check |

## JSON DSL Format

```json
{
  "chain_id": "unique-chain-id",
  "version": "1.0",
  "nodes": [
    {"id": "start", "type": "start", "config": {}},
    {"id": "step1", "type": "transform", "config": {"schema": {}}},
    {"id": "end", "type": "end", "config": {}}
  ],
  "edges": [
    {"from": "start", "to": "step1"},
    {"from": "step1", "to": "end"}
  ],
  "interceptors": [
    {"type": "logging"},
    {"type": "metrics"}
  ]
}
```

## Execution Flow

```
1. Load RuleChain from cache/DB
2. Find head_node (type="start")
3. Loop:
   a. Run all enabled before-interceptors
   b. Get NodeHandler for current node_type
   c. Execute handler with NodeContext + config
   d. Sync ctx (variables, node_outputs)
   e. Run all enabled after-interceptors
   f. Branch on NodeOutput:
      - Route(target) -> jump to target node
      - Continue -> follow edges to next node
      - Stop -> break loop
   g. On error: run on_error-interceptors -> terminate
4. Return ctx.output
```

## Cache & Hot Reload

- **RuleChainCache**: LRU cache (128 capacity) with Mutex
- **HotReload**: notify v8 watcher (macos_kqueue on macOS)
- Cache invalidation on file change events in skills/ directory

## Distributed Execution

- **InMemoryBus**: Single-node broadcast channel
- **RedisBus**: Planned for multi-node deployment (Redis Pub/Sub)

## Test Coverage

| Category | Tests | Status |
|----------|-------|--------|
| DSL Parser | 2 | pass |
| DSL Validator | 4 | pass |
| DSL Types | 2 | pass |
| Engine | 2 | pass |
| Node: start/end | 2 | pass |
| Node: condition | 2 | pass |
| Node: delay | 2 | pass |
| Node: transform/assign/log/rest_client/script/fork/join/loop/subchain/notification | 10 | pass |
| Registry | 1 | pass |
| Interceptor | 1 | pass |
| Cache | 2 | pass |
| **Total** | **30** | **all pass** |

## Verification

```bash
cargo test -p herness-rule  # 30 tests
cargo clippy -p herness-rule -- -D warnings
```
