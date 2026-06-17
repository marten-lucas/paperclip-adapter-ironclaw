# Adapter Starting Point Analysis: HTTP vs OpenCode-Local vs OpenClaw-Gateway

**Goal**: Determine the BEST starting point for building the Ironclaw adapter

**Conclusion**: ✅ **HTTP Adapter is the optimal starting point**

---

## Executive Comparison

| Factor | HTTP Adapter | OpenCode-Local | OpenClaw Gateway |
|--------|-------------|-----------------|-----------------|
| **Code Complexity** | ⭐ Low (~200 lines) | ⭐⭐ Medium (~700 lines) | ⭐⭐⭐⭐⭐ Very High (~1,500 lines) |
| **Relevance to Ironclaw** | ⭐⭐⭐⭐⭐ Perfect Match | ⭐ Not relevant | ⭐⭐ Different protocol |
| **Implementation Time** | 2-3 days | N/A | Not recommended |
| **Testing Complexity** | ⭐ Simple | ⭐⭐ Medium | ⭐⭐⭐ Complex |
| **Operational Overhead** | ⭐ Minimal | ⭐⭐ Subprocess mgmt | ⭐⭐⭐ Connection mgmt |
| **Session Approach** | Stateless (best for HTTP) | Disk-based persistence | Memory + prefix routing |
| **Model Discovery** | Static (good start) | Dynamic CLI probing | Gateway delegates |
| **Ironclaw Alignment** | **Best fit** | Wrong domain | Wrong protocol |

---

## Detailed Analysis

### 1. HTTP Adapter (Recommended ✅)

**What It Is**: Simple REST endpoint caller with basic error handling

**Architecture**:
```
POST /endpoint
  ↓ (2xx) ↓
Parse JSON response
Return to Paperclip
```

**Configuration Fields**:
- `url` - HTTP endpoint (required)
- `method` - HTTP method, default "POST"
- `headers` - Optional headers object
- `payloadTemplate` - Request body template (optional)
- `timeoutMs` - Request timeout (default: 30000)

**Session Handling**: **STATELESS**
- Each request is independent
- Caller maintains continuity (via `previous_response_id` for Ironclaw)
- No persistent state on adapter

**Model Discovery**: Static hardcoded list in adapter

**Error Handling**: Simple HTTP status codes
- Non-2xx → error
- Timeout → timeout error
- Network error → connection error

**Strengths for Ironclaw**:
✅ Perfect match for `/api/v1/responses` REST endpoint  
✅ Session continuity via `previous_response_id` (stateless)  
✅ Simple error handling (just HTTP status codes)  
✅ No WebSocket complexity  
✅ Fast to implement (~2-3 days)  
✅ Easy to test (mock HTTP responses)  

**Code Size**: ~200-300 lines total

**Example Execution**:
```typescript
const response = await fetch(config.url, {
  method: "POST",
  headers: {
    "Authorization": `Bearer ${config.authToken}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    input: message,
    model: config.model,
    previous_response_id: sessionId,
  }),
});

if (!response.ok) throw new Error(`HTTP ${response.status}`);
return response.json();  // { id, output, usage, ... }
```

---

### 2. OpenCode-Local Adapter (NOT Recommended ❌)

**What It Is**: Local subprocess wrapper for OpenCode CLI tool

**Architecture**:
```
Fork subprocess: opencode run
  ↓ (streams JSONL)
Parse JSONL events
  ↓
Return result
```

**Configuration Fields**:
- `model` - provider/model string (e.g., "openai/gpt-4")
- `environment` - LLM provider environment (OPENAI_API_KEY, etc.)
- `skills` - Optional custom skills symlinks

**Session Handling**: **DISK-BASED PERSISTENCE**
- SessionId maps to `~/.opencode/sessions/<sessionId>.json`
- Stores workspace, repo, cwd context
- Persists across adapter invocations
- Works great for stateful local tools

**Model Discovery**: Dynamic via `opencode models` CLI
- Runs subprocess to probe available models
- Cached 60s TTL
- Handles sandbox timeouts (120s)

**Error Handling**: Complex pattern matching
- Parse JSONL events for error indicators
- Check subprocess exit code
- Match stderr patterns for specific errors
- Handle model-not-found, session-lost, provider-auth errors

**Code Size**: ~700-800 lines

**Why NOT for Ironclaw**:
❌ Designed for LOCAL LLM runtime (OpenCode CLI tool)  
❌ Requires subprocess + file system access  
❌ Session approach (disk-based) doesn't fit Ironclaw's thread model  
❌ Over-engineered for simple HTTP gateway  
❌ Would require significant refactoring  
❌ Higher operational complexity  
❌ Harder to test (subprocess mocking required)  

---

### 3. OpenClaw-Gateway Adapter (NOT Recommended ❌)

**What It Is**: WebSocket gateway protocol implementation

**Architecture**:
```
WebSocket handshake
  ↓
Challenge-auth flow
  ↓
Device signing (Ed25519)
  ↓
Send RPC requests (JSON frames)
  ↓
Stream response events
```

**Configuration Fields** (15+):
- `url` - WebSocket URL (ws:// or wss://)
- `authToken` - Gateway token
- `devicePrivateKeyPem` - Ed25519 key (optional)
- `sessionKeyStrategy` - issue/fixed/run (default: issue)
- `sessionKey` - For fixed strategy
- `agentId` - Agent routing
- `disableDeviceAuth` - Skip device signing
- `autoPairOnFirstConnect` - Auto-approve devices
- `payloadTemplate` - Request fields merge-in
- Plus: client identity fields (clientId, clientMode, role, scopes)

**Session Handling**: **MEMORY-BASED WITH PREFIXING**
- Session key: `agent:{agentId}:paperclip:{strategy}:{contextId}`
- Three routing strategies (issue, fixed, run)
- Agent ID prefixing for isolation
- Resolved on each request

**Model Discovery**: Gateway delegates (empty list in adapter)

**Error Handling**: Frame-based + device pairing
- Frame `ok` flag for errors
- WebSocket close codes
- Device pairing challenge flow
- Timeout waiting for responses

**Code Size**: ~1,500+ lines

**Why NOT for Ironclaw**:
❌ Fundamentally different protocol (WebSocket vs HTTP REST)  
❌ Ironclaw doesn't support device auth (Ed25519 signing)  
❌ Device pairing workflow doesn't apply  
❌ No agent routing in Ironclaw Responses API  
❌ Over-engineered for simple REST endpoint  
❌ WebSocket connection state management unnecessary  
❌ Would require complete rewrite anyway  
❌ 5-7x more complex than HTTP approach  

---

## Side-by-Side Code Structure

### HTTP Adapter Structure
```typescript
src/server/
  ├─ execute.ts        (100 lines) - fetch() + parse JSON
  ├─ client.ts         (50 lines) - HTTP helper
  ├─ types.ts          (30 lines) - Interfaces
  └─ test.ts           (50 lines) - Mock responses
```

### OpenCode-Local Structure
```typescript
src/server/
  ├─ execute.ts        (400 lines) - Subprocess mgmt + JSONL parsing
  ├─ models.ts         (150 lines) - Model discovery CLI probing
  ├─ parse.ts          (100 lines) - JSONL event parsing
  ├─ runtime-config.ts (100 lines) - OpenCode config builder
  ├─ skills.ts         (100 lines) - Skill symlink management
  ├─ test.ts           (50 lines) - Test helpers
  └─ [5+ test files]   (200 lines) - Complex test suites
```

### OpenClaw-Gateway Structure
```typescript
src/server/
  ├─ execute.ts        (800 lines) - Gateway protocol + frame handling
  ├─ stream.ts         (100 lines) - Event stream parsing
  └─ test.ts           (100 lines) - Mock gateway responses
src/shared/
  └─ types.ts          (200 lines) - Protocol types
```

---

## Mapping: How Ironclaw Fits Each Model

### ✅ Perfect Fit: HTTP Adapter Model
```
┌─────────────────────────────────────┐
│   Ironclaw REST API                 │
│   POST /api/v1/responses            │
└─────────────────────────────────────┘
           ↑ (HTTP POST)
           │
┌─────────────────────────────────────┐
│   HTTP Adapter (Ironclaw impl)      │
│   - Send message                    │
│   - Get response_id back            │
│   - Use response_id for next call   │
└─────────────────────────────────────┘
           ↑ (execute function)
           │
    Paperclip Agents
```

### ❌ Wrong Domain: OpenCode-Local
```
OpenCode-Local is for: Local LLM tools (opencode CLI)
Ironclaw needs: HTTP gateway (no subprocess)
Mismatch: File-based sessions vs thread UUIDs
```

### ❌ Wrong Protocol: OpenClaw-Gateway
```
OpenClaw uses: WebSocket gateway (challenge-auth-RPC)
Ironclaw uses: HTTP REST (bearer token)
Mismatch: Device pairing vs simple tokens
Overhead: 5x more complexity than needed
```

---

## Recommendation Decision Matrix

### Scoring (1-5, higher is better)

| Criterion | HTTP | OpenCode | Gateway |
|-----------|------|----------|---------|
| **Ironclaw alignment** | 5 | 1 | 2 |
| **Implementation speed** | 5 | 2 | 1 |
| **Code simplicity** | 5 | 2 | 1 |
| **Testing ease** | 5 | 2 | 2 |
| **Operational overhead** | 5 | 2 | 1 |
| **Error handling** | 4 | 4 | 4 |
| **Model discovery capability** | 3 | 5 | 3 |
| **Session management** | 5 | 4 | 4 |
| **Documentation reusability** | 3 | 1 | 1 |
| **Community precedent** | 4 | 3 | 4 |
| **TOTAL SCORE** | **44** | **24** | **23** |

**Clear Winner: HTTP Adapter (44/50 = 88%)**

---

## Final Recommendation

### ✅ **Use HTTP Adapter as the Starting Point**

**Rationale**:
1. **Perfect architectural match** - Ironclaw REST endpoint
2. **Minimal complexity** - 200-300 lines vs 1,500+
3. **Fastest implementation** - 2-3 days for MVP
4. **Easiest testing** - Mock HTTP responses
5. **Lowest operational cost** - No subprocess or WebSocket management
6. **Clear session model** - Stateless + `previous_response_id`

**Implementation Plan**:
1. Copy HTTP adapter as template (NOT OpenCode or Gateway)
2. Adapt for Ironclaw Responses API specifics
3. Add model discovery via `/api/webchat/v2/llm/list-models`
4. Implement tool call round-trips
5. Add comprehensive tests

**Time Estimate**: 5-7 days (vs 15+ with Gateway or OpenCode)

---

## What to Borrow from Each

### From HTTP Adapter ✅ (90% of code base)
- Request/response structure
- Error handling patterns  
- Configuration validation
- Test framework

### From OpenCode-Local (Optional)
- Session codec pattern (if we need disk persistence later)
- Model discovery caching logic
- Skill injection patterns (not needed for Ironclaw)

### From OpenClaw-Gateway (Minimal)
- Device auth patterns (NOT applicable - skip)
- Session key prefixing (NOT applicable - Ironclaw uses thread IDs)
- Frame parsing (NOT applicable - HTTP responses)

---

## Next Steps

**Phase 4 Implementation**:
1. ✅ Use HTTP Adapter as baseline
2. ✅ Adapt for Ironclaw `/api/v1/responses`  
3. ✅ Add model discovery  
4. ✅ Implement tool round-trips
5. ✅ Comprehensive testing

**See**: `IMPLEMENTATION_SPEC.md` (already updated for HTTP approach)

**Start coding**: Create `src/server/client.ts` based on HTTP adapter pattern

---

*Recommendation made after comparing all three Paperclip adapter implementations for alignment, complexity, and implementation speed.*
