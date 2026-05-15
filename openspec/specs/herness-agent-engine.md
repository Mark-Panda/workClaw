# herness-agent-engine

## Status: Phase 2 Complete (Multimodal, SKILL, MCP, Subagent all implemented)

## Overview

The agent engine is the brain of workClaw. It manages AI agent lifecycles, orchestrates conversations, integrates with LLM providers, handles MCP (Model Context Protocol) tool calls, and manages SKILL definitions.

## Crate: `herness-core`

### Dependencies
- `herness-common` (shared types, errors, DB)
- `async-trait` (async trait support)
- `rmcp` (MCP protocol)
- `reqwest` (HTTP client for LLM APIs)
- `dashmap` (concurrent map for caches)
- `futures` / `tokio-stream` (streaming)

## Modules

### agent
- **Agent** struct: id, name, description, config (model, system_prompt, temperature, max_tokens), status
- **AgentConfig**: model selection, prompt template, temperature, token limit
- **SkillRegistry**: register/list/get/len/is_empty for SkillDefinition, `to_system_prompt()` for combined context
- **SkillDefinition**: name, description, version, body, tools, dependencies — parsed from SKILL.md
- **Subagent**: SubagentConfig, SubagentState (Idle/Running/Completed/Failed/Cancelled)
  - Isolated conversation context (SubagentMessage with role/content)
  - Turn counting with max_turns enforcement
  - Lifecycle state machine: Idle -> Running -> Completed/Failed/Cancelled
  - **SubagentManager**: Spawn, track, find by name/ID, cleanup completed subagents

### llm
- **LlmProvider** trait: `chat(request) -> String`, `chat_stream(request) -> Stream<StreamEvent>`
- **OpenAiProvider**: Implements LlmProvider for OpenAI-compatible APIs
  - Non-streaming: POST /v1/chat/completions
  - Streaming: SSE parsing with Text/ToolCall/Done events
  - Multimodal: Supports text + image_url (URL and base64) content parts
- **AnthropicProvider**: Implements LlmProvider for Anthropic Messages API
  - Non-streaming: POST /v1/messages
  - Streaming: SSE parsing for content_block_start/delta, message_delta/stop, tool_use
  - Multimodal: Supports text + image (base64) content parts
- **MessageContent** enum: Text(String) | MultiPart(Vec<ContentPart>)
- **ContentPart** enum: Text{text}, ImageUrl{image_url}, Image{source}
- **StreamEvent** enum: Text{content}, ToolCall{id,name,arguments}, Done{finish_reason}, Error{message}
- **ChatCompletionRequest**: model, messages[role,content], temperature, max_tokens, tools

### conversation
- **Conversation**: id, title, agent_id, messages[], created_at, updated_at
- **Message**: role (user/assistant/system), content, tool_calls, tool_call_id, token_count
- **ContextWindow**: Token estimation and trim logic for conversation history

### mcp
- **McpClientConfig**: name, transport (Stdio/Sse/StreamableHttp), command, args, url, env
- **McpClient**: Connected/disconnected state, tool registry, tool-to-LLM conversion
- **McpManager**: Multi-client management, all_tools aggregation across servers
- **McpService**: High-level connection management (stdio process spawning via rmcp, SSE endpoint routing)
- **Transport**: StdioTransportConfig with command, args, env, working_dir
- **Protocol**: Full JSON-RPC 2.0 types (Request/Response/Error), MCP Initialize, ListTools, CallTool
- **Types**: McpTool, McpResource, ToolCallResult, ToolResultContent

### orchestrator
- **Orchestrator**: Ties Agent + Conversation + LLM Provider + Tools + Skills + Subagents together
- Manages the agent loop: skill execution -> MCP tool discovery -> LLM call -> response handling
- Integrated SubagentManager for spawning subagents with isolated context
- Integrated SkillRuntimeRegistry for skill-aware system prompt augmentation

### skill_runtime
- **SkillRuntimeRegistry**: Scans directories for SKILL.md files, loads and caches skill definitions
- **Parser**: Parses SKILL.md YAML frontmatter (name, description, version, tools, dependencies) + markdown body
- **SkillExecutor**: Converts skill definitions to system prompt fragments, augments base prompts
- **ExecutionContext**: Carries env vars, working directory, task metadata for skill execution
- **SkillDefinition**: Enhanced with body, tools, dependencies, `to_system_prompt()` method

## Test Coverage

| Test | Status |
|------|--------|
| Agent construction / config defaults | pass |
| SkillRegistry register/get/len/sys_prompt | pass |
| Subagent initial state / lifecycle / max_turns / manager | pass (14 tests) |
| SubagentResult success/failure | pass |
| Conversation construction / add_message | pass |
| ContextWindow trim logic | pass |
| Message factory methods / multimodal | pass |
| MCP client construction / connect / disconnect / tools | pass (6 tests) |
| MCP protocol serialization/deserialization | pass (4 tests) |
| MCP service register/remove/tools | pass (4 tests) |
| MCP transport config | pass (2 tests) |
| Orchestrator creation / subagent / skills | pass (4 tests) |
| OpenAI provider construction / multimodal | pass (4 tests) |
| Anthropic provider construction / multimodal | pass (3 tests) |
| SSE stream parsing (OpenAI) | pass (2 tests) |
| SSE stream parsing (Anthropic) | pass (1 test) |
| SKILL.md parser (basic/tools/edge cases) | pass (5 tests) |
| Skill runtime registry (scan/reload/prompt) | pass (5 tests) |
| Skill executor (prepare/augment/execute) | pass (6 tests) |
| Skill runtime context | pass (2 tests) |

## Verification

```bash
cargo test -p herness-core     # 77 tests
cargo test --workspace         # 114 tests
cargo clippy --workspace -- -D warnings  # clean
```
