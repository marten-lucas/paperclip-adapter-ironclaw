# API Mapping: OpenClaw Gateway → Ironclaw Responses API

## Executive Summary

**Critical Finding**: Ironclaw and OpenClaw have **fundamentally different architectures**.

- **OpenClaw**: Request-response gateway protocol with stateless agents
- **Ironclaw**: Thread-based conversation system with persistent context

**Implication**: Cannot directly adapt OpenClaw Gateway adapter. Must build a new HTTP-based Responses API adapter.

---

## High-Level Mapping

### OpenClaw Gateway Flow (Stateless)
```
1. WebSocket Connect (challenge-based)
2. Send `req agent` (stateless request)
3. Receive `agent.wait` response (single result)
4. Stream `event agent` frames (transcript updates)
5. Connection closes
```

### Ironclaw Responses API Flow (Stateful)
```
1. HTTP POST /api/v1/responses (create or resume thread)
2. Request includes message + optional previous_response_id
3. Response includes result + response_id (thread ID)
4. To continue: send next request with previous_response_id
5. HTTP: Can make new requests indefinitely using same thread
6. WebSocket: Persistent connection with job/stream updates
```

---

## Detailed Field Mapping

### 1. Authentication

| Aspect | OpenClaw | Ironclaw |
|--------|----------|----------|
| **Mechanism** | Token + Ed25519 device auth | Bearer token only |
| **Device Auth** | Ephemeral or persistent keypairs | Not supported |
| **Auto-pairing** | Yes (device.pair.* methods) | N/A |
| **Header Format** | `Authorization: Bearer <token>` or `x-openclaw-token` | `Authorization: Bearer <token>` |
| **Multi-auth** | Yes (3-tier system) | Yes (3-tier system) |
| **Expiry** | Per-token optional | Per-token optional |

**Adaptation**: 
- ✅ Bearer token supported by both
- ❌ Drop device auth from Ironclaw (no device pairing in Ironclaw)
- ✅ Keep token management pattern

---

### 2. Agent Request

#### OpenClaw `req agent` Request
```json
{
  "message": "user prompt",
  "idempotencyKey": "run-123",
  "sessionKey": "agent:agent-id:paperclip:issue:issue-123",
  "agentId": "openclaw-agent-name",
  "payloadTemplate": {
    "tools": [...],
    "instructions": "system message"
  },
  "timeout": 60000
}
```

#### Ironclaw Responses API Request (First Call)
```json
{
  "input": "user prompt",
  "model": "default",
  "instructions": "system message",
  "tools": [
    {
      "type": "function",
      "name": "tool_name",
      "description": "...",
      "parameters": {...}
    }
  ],
  "stream": false
}
```

#### Ironclaw Responses API Request (Continuation)
```json
{
  "input": [
    {"type": "message", "role": "user", "content": "..."},
    {"type": "function_call_output", "call_id": "call_...", "output": "..."}
  ],
  "previous_response_id": "resp_...",
  "model": "default",
  "stream": false
}
```

**Mapping**:
| OpenClaw | Ironclaw | Notes |
|----------|----------|-------|
| `message` | `input` | User prompt text |
| `idempotencyKey` (runId) | (not used) | Ironclaw uses response_id for idempotency |
| `sessionKey` | (derived from response_id) | Ironclaw thread ID replaces session key |
| `agentId` | (not applicable) | No agent routing in Responses API |
| `payloadTemplate.tools` | `tools` | Tool definitions array |
| `payloadTemplate.instructions` | `instructions` | System message |
| `timeout` | (not used) | Ironclaw has server-side timeouts |

---

### 3. Agent Response

#### OpenClaw `agent.wait` Response (Completion)
```json
{
  "ok": true,
  "payload": {
    "runId": "run-123",
    "status": "ok",
    "result": {
      "meta": {
        "agentMeta": {
          "model": "gpt-4",
          "provider": "openai",
          "usage": {
            "inputTokens": 42,
            "outputTokens": 11
          }
        }
      },
      "text": "Assistant response"
    }
  }
}
```

#### Ironclaw Responses API Response (Success)
```json
{
  "id": "resp_abc123def456...",
  "object": "response",
  "created_at": 1715846400,
  "model": "gpt-4",
  "status": "completed",
  "output": [
    {
      "type": "message",
      "id": "item_...",
      "role": "assistant",
      "content": [
        {"type": "output_text", "text": "Assistant response"}
      ]
    }
  ],
  "usage": {
    "input_tokens": 42,
    "output_tokens": 11,
    "total_tokens": 53
  }
}
```

**Mapping**:
| OpenClaw | Ironclaw | Notes |
|----------|----------|-------|
| `ok` | `status === "completed"` | Success indicator |
| `runId` | `id` | Response ID becomes session ID |
| `meta.agentMeta.model` | `model` | Model name |
| `meta.agentMeta.provider` | (in `model` field) | Provider in model name? Need to check |
| `usage.inputTokens` | `usage.input_tokens` | Token usage |
| `result.text` | `output[0].content[0].text` | Response text extraction |

---

### 4. Tool Calls / Function Calls

#### OpenClaw Event Frames
```json
{
  "type": "event",
  "event": "agent",
  "payload": {
    "runId": "run-123",
    "stream": "assistant",
    "data": {"delta": "text chunk"}
  }
}
// OR
{
  "type": "event",
  "event": "agent",
  "payload": {
    "runId": "run-123",
    "stream": "error",
    "data": {"error": "message"}
  }
}
```

#### Ironclaw Streaming Events (SSE)
```
event: response.output_text.delta
data: {"delta": "text chunk"}

event: response.completed
data: {"status": "completed"}

// For tool calls:
event: response.output_item.added
data: {
  "type": "function_call",
  "call_id": "call_123",
  "name": "tool_name",
  "arguments": "{...}"
}
```

**Tool Call Round-Trip**:

1. **Model decides to call tool** → Ironclaw emits `function_call` event with `call_id`
2. **Client executes tool** → Gets result
3. **Client sends function output back**:
```json
{
  "input": [
    {
      "type": "function_call_output",
      "call_id": "call_123",
      "output": "{\"result\": \"...\"}"
    }
  ],
  "previous_response_id": "resp_...",
  "stream": false
}
```

---

### 5. Session Management

| Aspect | OpenClaw | Ironclaw |
|--------|----------|----------|
| **Session ID** | `sessionKey` (string, user-defined) | `response.id` (UUID, server-generated) |
| **Strategies** | `issue`, `fixed`, `run` | Implicit (one thread = one session) |
| **Context Persistence** | Per-session server-side | Per-thread server-side |
| **Continuation** | New request with same `sessionKey` | New request with `previous_response_id` |
| **Agent Isolation** | Via `agent:{agentId}:` prefix | Not applicable (no agent routing) |

**Adaptation Challenge**: 
- OpenClaw: One session spans multiple agents (multi-agent conversations)
- Ironclaw: One thread per conversation (no multi-agent sessions)
- **Solution**: Each Paperclip agent gets its own Ironclaw thread

---

### 6. Model Discovery

#### OpenClaw
- **Mechanism**: Static model list in adapter config
- **Export**: `export const models = [...]`
- **Discovery**: No API, hardcoded in adapter package

#### Ironclaw
- **Mechanism**: Dynamic API endpoint
- **Endpoint**: `POST /api/webchat/v2/llm/list-models`
- **Discovery**: Query on adapter initialization

**Request**:
```json
{
  "provider": "openai"  // optional
}
```

**Response**:
```json
{
  "models": [
    "gpt-4",
    "gpt-4o",
    "gpt-3.5-turbo"
  ]
}
```

**Adaptation**:
```typescript
// In adapter init:
async function loadModels() {
  const response = await fetch('/api/webchat/v2/llm/list-models', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}` },
    body: JSON.stringify({})
  });
  const data = await response.json();
  return data.models.map(m => ({ id: m, label: m }));
}
```

---

### 7. Tools / Skills Discovery

#### OpenClaw
- **Mechanism**: Static tool list or payload template
- **Discovery**: No discovery API
- **Injection**: Via `payloadTemplate` in request

#### Ironclaw
- **Mechanism**: Manifest-based + built-in registry
- **Built-in Tools**: ~15 core tools (file, shell, web, memory, etc.)
- **Extensions**: Via WASM, MCP, Docker (complex, requires manifest)
- **Discovery**: Implicit in extension system

**Built-in Tools Available**:
- `file_read`, `file_write`, `file_append`
- `shell_execute`
- `web_fetch`
- `memory_save`, `memory_search`, `memory_recall`
- `json_parse`, `json_transform`
- `get_time`
- `job_create`, `job_cancel`, `job_status`
- And more...

**Adaptation**:
```typescript
// Option 1: Use built-in tools implicitly
// (Ironclaw automatically provides them in tool context)

// Option 2: Expose as static list
const ironclaw_tools = [
  {
    name: "file_read",
    description: "Read contents of a file",
    parameters: { type: "object", properties: { path: { type: "string" } } }
  },
  // ... more tools
];

// For Paperclip skills injection:
// Create a skills manifest that references these tools
```

---

## Architecture Decision: HTTP vs WebSocket

### Option A: HTTP Responses API (Recommended)
```
Paperclip Agent
    ↓
    | HTTP POST /api/v1/responses
    ↓
Ironclaw Responses API
    ↓ (creates or resumes thread)
    ↓
LLM + Tool Execution
    ↓
HTTP Response (with response_id for continuation)
```

**Pros**:
- Simple, clean, uses public API
- Works with stateless HTTP
- Built-in session continuation via `previous_response_id`
- No special authentication (Bearer token)

**Cons**:
- Polling for real-time updates (not streaming)
- Multiple round-trips for tool calls

**Implementation Time**: ~1-2 weeks

### Option B: WebSocket Gateway (Complex)
```
Paperclip Agent
    ↓
    | WebSocket /ws
    ↓
Ironclaw WebSocket Gateway
    ↓ (creates thread, manages jobs)
    ↓
LLM + Tool Execution
    ↓
WebSocket Events (streaming)
```

**Pros**:
- Real-time bidirectional streaming
- Single connection for full conversation
- Can stream token-by-token

**Cons**:
- Must reimplement Ironclaw's WebSocket protocol
- Complex state management
- Duplicates threading logic
- Requires deep protocol understanding

**Implementation Time**: ~4-6 weeks

---

## Recommended Implementation Plan

### Phase A: HTTP Responses API Adapter (MVP)
1. Create new adapter type: `ironclaw_responses`
2. Implement execute function using REST API
3. Handle model discovery
4. Handle tool call round-trips
5. Map session continuity

### Phase B: Enhancements (Optional)
1. Add WebSocket support for streaming
2. Add real-time SSE log streaming
3. Performance optimizations

### Phase C: Advanced Features (Future)
1. Thread management UI
2. Bulk operations support
3. Webhook integration

---

## Known Limitations / Gaps

| Limitation | Impact | Workaround |
|-----------|--------|-----------|
| No agent routing in Responses API | Can't target specific Ironclaw agent | Each Paperclip agent gets own thread |
| Device auth not supported | Device pairing workflow doesn't apply | Use API tokens only |
| Thread-per-agent model | No shared session across agents | Design guides for session management |
| Tool execution requires approval | Some tools have approval gates | Handle `requires_approval` responses |
| Model name parsing (provider extraction) | Can't determine provider from model string | May need separate provider field in API |

---

## Success Criteria

✅ Adapter implementation is successful when:
1. Paperclip agent can send message to Ironclaw
2. Ironclaw responds with assistant message
3. Model list dynamically discovered from `/api/webchat/v2/llm/list-models`
4. Tools work in a round-trip (tool call → execution → response)
5. Session continuity via `previous_response_id`
6. Error handling for auth, timeouts, tool failures
7. Usage metrics (tokens) properly reported back to Paperclip

---

## Questions Remaining

1. **Provider Extraction**: Can we determine LLM provider from model name, or do we need separate field?
2. **Thread Per Agent**: Should each Paperclip agent create new Ironclaw thread, or reuse shared?
3. **Tool Filtering**: Should adapter expose all built-in tools or a curated subset?
4. **Approval Handling**: How should adapter respond to `requires_approval` tool calls?
5. **Real-Time Needs**: Is HTTP polling sufficient or do we need WebSocket streaming?

---

## Next Steps

1. ✅ Architecture analysis complete
2. ✅ API mapping complete  
3. ⏭️ Create detailed implementation plan (Phase 3)
4. ⏭️ Begin development (Phase 4)

See `DEVELOPMENT_PLAN.md` for full roadmap.
