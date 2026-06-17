# Ironclaw Gateway Architecture & API Analysis

Source: https://github.com/nearai/ironclaw + Running instance at 10.12.12.102:3000

## 🏗️ Architecture Overview

Ironclaw is a sophisticated Rust-based AI agent framework with:
- **Multi-channel access** (Web, Telegram, terminal UI, webhooks)
- **Multi-LLM provider support** (20+ providers: OpenAI, Anthropic, Ollama, etc.)
- **Thread-based conversation model** (not request-response like OpenClaw)
- **Manifest-based extension system** (WASM, MCP, Docker, native)
- **Production-grade security** (3-tier auth, capability grants, approval workflows)

---

## 🔌 Gateway Protocol

### Transport Layer
- **Primary**: WebSocket (`ws://` or `wss://`)
- **Secondary**: SSE (Server-Sent Events) for logs/streams
- **Endpoint**: `ws://host:3000/ws`

### Authentication (WebSocket Connection)

Immediate after WebSocket handshake, client must send:

```json
{
  "type": "auth",
  "token": "<GATEWAY_AUTH_TOKEN>"
}
```

Server responds with:
```json
{
  "type": "auth_ok",
  "user_id": "..."
}
// OR
{
  "type": "error",
  "code": "auth_failed"
}
```

**Must complete within 10 seconds or connection is rejected.**

### WebSocket Frame Protocol

**Client → Server:**
- `auth` - Authenticate connection
- `chat` - Send message: `{"message": "...", "session_id": "..."}`
- `cancel_job` - Cancel running job: `{"job_id": "..."}`
- `ping` - Keepalive ping

**Server → Client:**
- `auth_ok` - Authentication succeeded
- `job_created` - `{"job_id": "...", "status": "pending"}`
- `job_update` - `{"job_id": "...", "status": "...", "output": "..."}`
- `job_complete` - `{"job_id": "...", "result": "..."}`
- `job_failed` - `{"job_id": "...", "error": "..."}`
- `tool_call` - `{"job_id": "...", "tool": "...", "params": {}}`
- `stream_chunk` - `{"job_id": "...", "delta": "..."}`
- `error` - Protocol/server error
- `pong` - Keepalive pong

### Reference Implementation
- Gateway: [src/channels/web/platform/ws.rs](https://github.com/nearai/ironclaw/blob/main/src/channels/web/platform/ws.rs)
- Protocol Spec: [docs/drafts/ops/websocket-sse.mdx](https://github.com/nearai/ironclaw/blob/main/docs/drafts/ops/websocket-sse.mdx)

---

## 👤 Agent Management

### Thread-Based Model (NOT request-response)

Ironclaw uses a **conversation thread model** with sophisticated state management:

1. **Threads** - Persistent conversation containers
2. **Jobs** - Individual execution units within threads
3. **Context Windows** - Per-thread LLM context (with compaction strategies)
4. **Turn Tracking** - Sequential turn-by-turn execution

### Key Components

| Component | Purpose |
|-----------|---------|
| `ThreadId` | Unique conversation identifier (UUID) |
| `SessionManager` | Manages thread lifecycle and state persistence |
| `LoopDelegate` | Shared agentic loop engine (used by chat, jobs, container paths) |
| `ToolRegistry` | Per-thread tool catalog (external + built-in) |

### Built-in Tools (~15+)
- File operations: `file_read`, `file_write`, `file_append`, etc.
- Shell: `shell_execute`
- Web: `web_fetch`, `http_request`
- Memory: `memory_save`, `memory_search`, `memory_recall`
- JSON manipulation: `json_parse`, `json_transform`
- Time: `get_time`
- Job management: `job_create`, `job_cancel`, `job_status`

### Execution Safety
- **Approval gates** for dangerous operations
- **Per-job timeouts** enforcement
- **Context window** automatic compaction
- **Background heartbeat** system for proactive execution

### Reference Implementation
- Agentic Loop: [src/agent/agentic_loop.rs](https://github.com/nearai/ironclaw/blob/main/src/agent/agentic_loop.rs)
- Session Manager: [src/channels/web/platform/state.rs](https://github.com/nearai/ironclaw/blob/main/src/channels/web/platform/state.rs)

---

## 🤖 Models / LLM Provider System

### Supported Providers (20+)
- OpenAI (GPT-4, GPT-4o, etc.)
- Anthropic (Claude models)
- Google Gemini
- Ollama (local)
- NEAR AI (native)
- AWS Bedrock
- Azure OpenAI
- And many more...

### Model Discovery API

Endpoint: `POST /api/webchat/v2/llm/list-models`

**Request:**
```json
{
  "provider": "openai"  // optional filter
}
```

**Response:**
```json
{
  "models": [
    "gpt-4",
    "gpt-4o",
    "gpt-3.5-turbo",
    ...
  ]
}
```

### Configuration
- Per-provider API keys (env or DB-backed secrets)
- Backend selection via `LLM_BACKEND` environment variable
- Model caching with configurable TTL
- Dynamic provider loading

### Reference Implementation
- Model Fetcher: [crates/ironclaw_llm/src/models.rs](https://github.com/nearai/ironclaw/blob/main/crates/ironclaw_llm/src/models.rs)
- Provider Trait: [crates/ironclaw_llm/src/provider.rs](https://github.com/nearai/ironclaw/blob/main/crates/ironclaw_llm/src/provider.rs)
- Config: [crates/ironclaw_llm/src/config.rs](https://github.com/nearai/ironclaw/blob/main/crates/ironclaw_llm/src/config.rs)

---

## 🛠️ Tools / Extensions System

### Extension Types

Ironclaw supports multiple tool runtime types:

1. **WASM Tools** - Sandboxed WASM modules (schema-driven)
2. **MCP Servers** - Model Context Protocol adapters (stdio/HTTP)
3. **Scripts/CLI** - Docker-backed native executables
4. **First-Party** - Built-in system services
5. **Skills** - Workspace-local prompt-level modules

### Capability Declaration (manifest.toml)

```toml
[[host_api]]
id = "ironclaw.capability_provider/v1"
section = "capability_provider.tools"

[[capability_provider.tools.capabilities]]
id = "slack.send_message"
description = "Send a Slack message"
effects = ["network"]
default_permission = "ask"
visibility = "model"
input_schema_ref = "schemas/slack/send_message.input.v1.json"
output_schema_ref = "schemas/slack/send_message.output.v1.json"
```

### ActionDef Structure

Each tool definition includes:
- `name` - Unique identifier
- `description` - LLM-visible description
- `parameters_schema` - JSON Schema for inputs
- `effects` - Security declaration (e.g., "network", "file_write", "execute_code")
- `requires_approval` - Boolean execution gate
- `model_tool_surface` - "FullSchema" or "CompactToolInfo"

### Tool Execution Pipeline

1. **Dispatcher** - Central tool dispatcher with safety checks
2. **Validation** - Parameter normalization & schema validation
3. **Redaction** - Sensitive parameter masking
4. **Execution** - Per-tool timeout enforcement
5. **Policy** - Network policy evaluation & credential injection
6. **Detection** - Response leak detection

### Discovery API

Tools are discovered via the **extension manifest system**. Built-in tools are automatically registered.

### Reference Implementation
- Extension Contract: [docs/reborn/contracts/extensions.md](https://github.com/nearai/ironclaw/blob/main/docs/reborn/contracts/extensions.md)
- Tool Registry: [src/tools/registry.rs](https://github.com/nearai/ironclaw/blob/main/src/tools/registry.rs)
- Built-in Tools: [src/tools/builtin/](https://github.com/nearai/ironclaw/blob/main/src/tools/builtin/)

---

## 📨 Responses API (External Tool Integration)

### Overview
Ironclaw exposes an **OpenAI-compatible Responses API** for external tools and Paperclip integration.

### Endpoint
`POST /api/v1/responses` (alias: `/v1/responses`)

### Request Format

```json
{
  "input": "What time is it?" | [
    { "type": "message", "role": "user", "content": "..." },
    { "type": "function_call_output", "call_id": "call_...", "output": "{...}" }
  ],
  "model": "default",
  "instructions": "Optional system message",
  "previous_response_id": "resp_...",
  "stream": false,
  "tools": [
    {
      "type": "function",
      "name": "lookup_weather",
      "description": "Get weather for a city",
      "parameters": {
        "type": "object",
        "properties": { "city": { "type": "string" } },
        "required": ["city"]
      }
    }
  ],
  "x_context": { "webhook": { "source": "stripe", "event": "invoice.paid" } }
}
```

### Response Format (Non-Streaming)

```json
{
  "id": "resp_<64hex>",
  "object": "response",
  "created_at": 1715846400,
  "model": "default",
  "status": "completed",
  "output": [
    {
      "type": "message",
      "id": "item_...",
      "role": "assistant",
      "content": [
        { "type": "output_text", "text": "It is 14:23 UTC." }
      ]
    }
  ],
  "usage": { "input_tokens": 42, "output_tokens": 11, "total_tokens": 53 }
}
```

### Streaming (SSE)

Events emitted:
- `response.created` - Initial response shell
- `response.output_item.added` - New item (message or function_call)
- `response.output_text.delta` - Token delta for text chunks
- `response.output_item.done` - Item finalized
- `response.completed` - Terminal success

### Tool Call Round-Trip

1. Model emits `function_call` with `call_id` and `arguments`
2. Client executes the tool locally
3. Client sends new request with same `previous_response_id` and `function_call_output` item
4. Agent resumes on same thread with accumulated context

### Session Continuity

- Each response embeds a **thread UUID** in the `id` field
- Pass `previous_response_id` to continue conversation
- Thread state managed server-side
- Full conversation history available across requests

### Reference Implementation
- API Spec: [docs/api/responses.mdx](https://github.com/nearai/ironclaw/blob/main/docs/api/responses.mdx)
- Implementation: [src/channels/web/responses_api.rs](https://github.com/nearai/ironclaw/blob/main/src/channels/web/responses_api.rs)

---

## 🔐 Authentication

### Three-Tier System

#### Tier 1: Single-User (Environment)
- `GATEWAY_AUTH_TOKEN` environment variable
- 32-byte random token (64 hex characters)
- Authenticates: web UI, Telegram bridge, Responses API

#### Tier 2: Multi-User (Database-Backed)
- Per-user API tokens via `POST /api/tokens`
- Optional expiry (`expires_in_days`)
- Revocable tokens with per-user scope
- Bearer token in `Authorization: Bearer <token>` header

#### Tier 3: OIDC/JWT (Optional)
- JWKS-based verification (5-min TTL cache)
- Claims validation: `iss`, `aud`, `exp`, `nbf` (not-before)
- Algorithm allowlist (RS/ES only, HS256 rejected)
- Email domain restriction

### Token Management

```bash
# Create token
curl -X POST https://host/api/tokens \
  -H "Authorization: Bearer $GATEWAY_AUTH_TOKEN" \
  -d '{"name":"my-integration","expires_in_days":90}'

# List tokens
curl https://host/api/tokens \
  -H "Authorization: Bearer $TOKEN"

# Revoke token
curl -X DELETE https://host/api/tokens/<id> \
  -H "Authorization: Bearer $TOKEN"
```

### Security Properties
- Constant-time token comparison (SHA-256 hash)
- Per-job orchestrator tokens (ephemeral, scoped)
- Credentials never logged (sanitized responses)
- Network credential injection (tokens invisible to containers)

### Reference Implementation
- v1 Auth: [src/channels/web/auth.rs](https://github.com/nearai/ironclaw/blob/main/src/channels/web/auth.rs)
- v2 Auth (WebChat): [crates/ironclaw_reborn_webui_ingress/](https://github.com/nearai/ironclaw/blob/main/crates/ironclaw_reborn_webui_ingress/)

---

## 📊 Key Differences: Ironclaw vs OpenClaw

| Aspect | Ironclaw | OpenClaw (Assumed) |
|--------|----------|-------------------|
| **Protocol** | WebSocket + SSE (JSON frames) | WebSocket (challenge-connect-agent) |
| **Agent Model** | Thread-based conversation | Request-response / session-based |
| **API Surface** | OpenAI Responses API | Proprietary agent request API |
| **Tool System** | Manifest-based extensions (WASM/MCP/Docker) | Simpler tool registry |
| **Authentication** | 3-tier (env/DB/OIDC) | Token + device auth (Ed25519) |
| **Models** | 20+ dynamic providers | Limited set |
| **Extension Runtime** | Multi-lane (WASM, MCP, Docker) | Unknown |
| **Security Model** | Effect-based permissions, approval gates | Basic permission system |
| **Secrets Management** | Encrypted store + credential injection | Basic token handling |

---

## ⚠️ Critical Implementation Considerations

### 1. **NOT a Direct Gateway Protocol Adaptation**
- Cannot simply adapt OpenClaw Gateway protocol
- Ironclaw has fundamentally different architecture
- Need to build an HTTP-based adapter instead of WebSocket gateway proxy

### 2. **Shared Adapter Pattern Challenge**
- Ironclaw creates persistent **threads** (not stateless requests)
- Thread ID becomes the session identifier
- All Paperclip agents must use same Ironclaw thread or create new threads?

### 3. **Model Discovery**
- ✅ Available via API: `POST /api/webchat/v2/llm/list-models`
- Dynamic discovery per agent setup
- Cache models with TTL strategy

### 4. **Tools/Skills Discovery**
- ⚠️ Complex: Built-in tools are implicit, extensions need manifest parsing
- May need to expose all built-in tools statically
- Extension tools available at runtime through agent loop

### 5. **Responses API Integration**
- Paperclip adapters send to `/api/v1/responses`
- Session continuity via `previous_response_id`
- Tool call round-trip via `function_call_output`

### 6. **Thread Management**
- Decision: One thread per Paperclip agent? Or shared thread?
- Thread ID becomes session key
- Context window management automatic (Ironclaw handles)

---

## 🎯 Implementation Strategy (Draft)

### Option A: HTTP Responses API Adapter (Recommended)
- **Pros**: Simple, clean, uses public API
- **Cons**: Less real-time than WebSocket gateway
- **Use**: Standard HTTP adapter with session continuation

### Option B: WebSocket Gateway Protocol Adapter
- **Pros**: Real-time bidirectional streaming
- **Cons**: Complex state management, duplicate threading
- **Use**: If real-time is critical

### Option C: Hybrid (HTTP + WebSocket for logging)
- **Pros**: Best of both worlds
- **Cons**: Most complex implementation
- **Use**: Production-grade with advanced features

**Recommendation**: Start with **Option A** (HTTP Responses API) for simplicity and correctness. Upgrade to hybrid if needed.

---

## 📚 Reference Documentation Files

- Gateway Protocol: `docs/drafts/ops/websocket-sse.mdx`
- Responses API: `docs/api/responses.mdx`
- Extensions: `docs/reborn/contracts/extensions.md`
- Security: `docs/reborn/security-parity/01-auth.md`
- Network Security: `src/NETWORK_SECURITY.md`

---

## Next Steps

1. ✅ Architecture analysis complete
2. ⏭️ Create Ironclaw protocol documentation in `/doc/ironclaw-doc/`
3. ⏭️ Map OpenClaw → Ironclaw adapter pattern
4. ⏭️ Develop detailed implementation plan for HTTP Responses API adapter
5. ⏭️ Begin Phase 4 development
