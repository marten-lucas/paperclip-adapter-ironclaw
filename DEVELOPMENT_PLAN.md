# Paperclip-Ironclaw Adapter Development Plan

## Project Overview
Develop a Paperclip adapter for Ironclaw based on the OpenClaw Gateway adapter. The adapter enables Paperclip agents to invoke Ironclaw over a WebSocket gateway protocol.

### Key Requirements
1. **Shared Adapter Pattern**: Single adapter instance used by all Paperclip agents; agents are defined in Ironclaw, not Paperclip
2. **Dynamic Model Discovery**: Query Ironclaw API for available models each time a Paperclip agent is set up
3. **Dynamic Tools/Skills**: Query Ironclaw for available capabilities/tools to report back to Paperclip
4. **Agent Routing**: Use Ironclaw's agents endpoint to route requests to agent-specific resources

---

## Phase 1: Documentation & Analysis

### 1.1 Gather Documentation
**Goal**: Collect and organize documentation from both systems

**Tasks**:
- [ ] Download Paperclip documentation from https://docs.paperclip.ing
- [ ] Download Ironclaw documentation from https://docs.ironclaw.com/
- [ ] Store in `/doc/paperclip-doc/` and `/doc/iconclaw-doc/` respectively
- [ ] Extract API specs, gateway protocol docs, agent management docs

**Output**: 
- Organized docs directory with key specs extracted
- Summary of API differences between systems

### 1.2 Analyze OpenClaw Gateway Protocol
**Goal**: Deep understanding of existing gateway implementation

**Key Technical Details** (from current analysis):
- **Transport**: WebSocket (ws:// or wss://)
- **Protocol**: Frame-based (request/response/event)
- **Protocol Version**: 3
- **Authentication**: Token-based + device auth (Ed25519)
- **Session Strategy**: issue/fixed/run modes with agent ID prefixing
- **Handshake**: Challenge→connect→agent→wait flow

**Frames Overview**:
```
RequestFrame:  {type: "req", id: uuid, method: string, params: object}
ResponseFrame: {type: "res", id: uuid, ok: boolean, payload?, error?}
EventFrame:    {type: "event", event: string, payload?, seq?}
```

**Agent Request**:
- Required: `message`, `idempotencyKey` (runId), `sessionKey`
- Optional: `agentId`, merged `payloadTemplate`, `timeout`

**Agent Response** (staged):
- `agent` frame: initial acceptance
- `agent.wait` frame: final result after timeout
- `meta.agentMeta`: model/provider/cost info

**Event Frames**:
- `event: "agent"` with streams: `assistant` (deltas), `error`, `lifecycle`

**Tasks**:
- [ ] Review `/src/server/execute.ts` gateway client implementation
- [ ] Document state machine flow (connect→request→stream→complete)
- [ ] Identify ED25519 device signing implementation
- [ ] Map error handling and timeout behavior

**Output**: 
- Architecture diagram of gateway flow
- Gateway protocol sequence diagram
- State machine documentation

### 1.3 Review Paperclip Issues & PRs
**Goal**: Identify fixes/improvements to adopt

**Tasks**:
- [ ] Search Paperclip repo issues related to adapters/gateway
- [ ] Review PRs for openclaw-gateway
- [ ] Check for known limitations or bugs
- [ ] Evaluate if any fixes are applicable to Ironclaw adapter

**Output**: 
- List of relevant issues/PRs with assessment
- Decision matrix: adopt/skip/adapt

---

## Phase 2: API Mapping & Protocol Analysis

### 2.1 Map OpenClaw ↔ Ironclaw APIs

**OpenClaw Gateway Endpoints** (to map):
- `req connect` → Ironclaw equivalent
- `req agent` → Ironclaw agents endpoint
- `req agent.wait` → Ironclaw wait/poll mechanism
- `device.pair.list` / `device.pair.approve` → Ironclaw device pairing (if exists)

**Model Discovery** (Critical Change):
- OpenClaw: Models reported in result metadata only (no discovery endpoint)
- Ironclaw: Must support dynamic model discovery endpoint

**Tools/Skills Reporting** (Critical Change):
- OpenClaw: No tool reporting in adapter
- Ironclaw: Must query for available tools/capabilities

**Tasks**:
- [ ] Document Ironclaw gateway protocol (compare with OpenClaw)
- [ ] Identify Ironclaw agents endpoint request/response format
- [ ] Find Ironclaw model discovery API
- [ ] Find Ironclaw tools/capabilities API
- [ ] Determine if device auth exists in Ironclaw
- [ ] Map session key routing in Ironclaw

**Output**: 
- API mapping table: OpenClaw method → Ironclaw method
- Protocol compatibility report
- Decision: use same frame protocol or adapt?

### 2.2 Determine Connection Method
**Goal**: Confirm WebSocket vs HTTP for Ironclaw

**Tasks**:
- [ ] Verify Ironclaw supports WebSocket gateway
- [ ] Check if HTTP alternative exists
- [ ] Assess performance/latency implications
- [ ] Confirm device auth mechanism in Ironclaw

**Output**: 
- Connection method decision
- Protocol compatibility matrix

---

## Phase 3: Implementation Planning

### 3.1 Create Detailed Implementation Phase Plan
**Goal**: Break down into concrete development tasks

**High-Level Components to Modify**:
1. **Index Configuration** (`src/index.ts`)
   - Rename from openclaw_gateway → ironclaw_gateway
   - Update agentConfigurationDoc
   - Add model discovery configuration

2. **Gateway Client** (`src/server/execute.ts`)
   - Adapt connect request for Ironclaw
   - Adapt agent endpoint method
   - Add model list query on adapter init
   - Add tools/capabilities query

3. **Stream Handler** (`src/shared/stream.ts`)
   - Verify frame format compatibility
   - Adapt any Ironclaw-specific stream formats

4. **UI/CLI** (`src/ui/`, `src/cli/`)
   - Update for Ironclaw configuration
   - Add model/tools discovery UI

5. **Tests** (`src/server/execute.test.ts`)
   - Create Ironclaw-specific test fixtures
   - Mock Ironclaw gateway responses

### 3.2 Identify Limitations
**Goal**: Document what cannot be migrated

**Known Constraints**:
- [ ] Session key prefixing: Does Ironclaw support similar agent context isolation?
- [ ] Device auth: If Ironclaw doesn't have device auth, what's the security model?
- [ ] Auto-pairing: If not in Ironclaw, how to handle first-time auth?
- [ ] Model discovery: Real-time vs cached vs batch discovery?
- [ ] Tools/skills: Static set or dynamic per-agent?

**Output**: 
- Limitations matrix with mitigation strategies
- Feature parity assessment

---

## Phase 4: Core Development

### Current Direction
The preferred implementation path is the thin custom shim on CT300, not a Paperclip core or frontend contribution.

That means Phase 4 should prioritize:
- maintaining the shim as the compatibility boundary
- keeping model selection explicit in the proxy/adapter contract
- avoiding a dependency on external Paperclip UI changes

### Architecture Decision: HTTP Responses API (Not Gateway Protocol)

Implementation note:
- Use the CT300 shim as the maintainable compatibility layer for Ironclaw-specific quirks and routing.
- Keep the Paperclip-facing adapter surface stable and minimal.
- Do not introduce a Paperclip frontend patch unless the shim can no longer preserve model choice.

**Critical Finding from Phase 2**: 
Ironclaw and OpenClaw have fundamentally different architectures. Cannot adapt the gateway protocol. Instead, build an HTTP-based adapter using Ironclaw's Responses API.

**Key Differences**:
- **OpenClaw**: Request-response gateway protocol
- **Ironclaw**: Thread-based conversation API with persistent context
- **Session Model**: Ironclaw uses `response_id` (thread UUID) instead of `sessionKey`
- **API**: `POST /api/v1/responses` for agent requests
- **Continuity**: Via `previous_response_id` for multi-turn conversations

### 4.1 Adapter Base Implementation
**Tasks**:
- [ ] Create new adapter type: `ironclaw_responses` (or `ironclaw_gateway`)
- [ ] Update configuration documentation (for HTTP Responses API)
- [ ] Remove WebSocket gateway code (not applicable)
- [ ] Implement HTTP client for Responses API
- [ ] Add authentication handling (Bearer token)
- [ ] Implement request/response mapping (OpenClaw → Ironclaw payload format)

**File Changes**:
- `src/index.ts` - Update adapter metadata
- `src/server/execute.ts` - Replace gateway client with HTTP client
- `src/server/types.ts` (new) - Request/response types for Responses API
- Remove: `src/server/execute.test.ts` gatway tests (will create new tests)

### 4.2 Dynamic Discovery Implementation
**Tasks**:
- [ ] Implement model list discovery via `POST /api/webchat/v2/llm/list-models`
- [ ] Cache model list with TTL (e.g., 1 hour)
- [ ] Export discovered models in `models` array
- [ ] Implement built-in tools list (hardcoded for MVP)
- [ ] Document how to extend tool discovery in future

**Built-in Tools to Include**:
- File operations: `file_read`, `file_write`, `file_append`
- Shell: `shell_execute`
- Web: `web_fetch`
- Memory: `memory_save`, `memory_search`, `memory_recall`
- JSON: `json_parse`, `json_transform`
- Time: `get_time`
- Job management: `job_create`, `job_cancel`, `job_status`

### 4.3 Session Management (Thread-Based)
**Tasks**:
- [ ] Implement thread creation on first request
- [ ] Store `response_id` as session identifier
- [ ] Implement session continuation via `previous_response_id`
- [ ] Handle multi-turn conversations
- [ ] Test context preservation across turns

**Key Difference from OpenClaw**:
- No more `sessionKeyStrategy` (issue/fixed/run)
- No agent ID prefixing (Ironclaw doesn't route to agents)
- Each Paperclip agent creates its own Ironclaw thread

### 4.4 Tool Call Round-Trip Implementation
**Tasks**:
- [ ] Handle `function_call` responses from Ironclaw
- [ ] Implement tool result injection
- [ ] Send follow-up request with `function_call_output`
- [ ] Resume conversation with context intact
- [ ] Handle tool execution errors

**Flow**:
1. Initial request → Ironclaw returns `function_call`
2. Extract tool name and parameters
3. Client executes tool (or routes to Paperclip)
4. Send new request with `function_call_output` + `previous_response_id`
5. Continue until no more tool calls

### 4.5 Error Handling & Logging
**Tasks**:
- [ ] Handle HTTP errors (401, 404, 500, timeout)
- [ ] Map Ironclaw error codes to Paperclip errors
- [ ] Create adapter-specific log prefixes
- [ ] Handle approval gate responses
- [ ] Log token usage for cost tracking

**Error Types to Handle**:
- Authentication errors (invalid token)
- Thread not found (session expired?)
- Tool execution failures
- Timeout scenarios
- Network errors

---

## Phase 5: Testing Strategy

### 5.1 Local Unit Tests
**Goal**: Verify adapter logic without external systems

**Test Scope**:
- [ ] Gateway frame parsing/generation
- [ ] Session key resolution
- [ ] Error handling paths
- [ ] Model discovery logic
- [ ] Tools discovery logic

**Test Framework**: Existing test patterns from execute.test.ts

### 5.2 Integration Tests
**Goal**: Test with mock Ironclaw gateway

**Test Scope**:
- [ ] Full connection flow
- [ ] Agent request → response → completion
- [ ] Event streaming
- [ ] Authentication flows
- [ ] Timeout handling
- [ ] Model discovery endpoint

### 5.3 System Testing (with Network Access)
**Goal**: End-to-end testing with real systems

**Requirements** (to be provided):
- Paperclip instance URL + credentials
- Ironclaw instance URL + credentials
- Ollama instance URL (for model backend)
- Network accessibility

**Test Scenarios**:
- [ ] Paperclip agent creates Ironclaw request
- [ ] Model list queried successfully
- [ ] Tools/capabilities returned correctly
- [ ] Agent execution completes end-to-end
- [ ] Multi-agent isolation verified
- [ ] Error scenarios handled gracefully

**Deployment Target**: Test environment with all three services

---

## Phase 6: Validation & Optimization

### 6.1 Performance Testing
**Tasks**:
- [ ] Measure connection establishment time
- [ ] Measure agent request latency
- [ ] Measure model discovery latency
- [ ] Identify bottlenecks

### 6.2 Stress Testing
**Tasks**:
- [ ] Test multiple concurrent agents
- [ ] Test rapid model discovery calls
- [ ] Test session handling under load

### 6.3 Security Review
**Tasks**:
- [ ] Review auth token handling
- [ ] Verify no sensitive data in logs
- [ ] Test auth failure scenarios

---

## Limitations & Known Issues

### Unable to Migrate from OpenClaw Gateway
The following OpenClaw features **cannot be migrated to Ironclaw** due to architectural differences:

1. **WebSocket Gateway Protocol** 
   - OpenClaw: Stateless WebSocket gateway with challenge-based auth
   - Ironclaw: Thread-based HTTP Responses API
   - **Workaround**: Use HTTP Responses API instead

2. **Device Authentication (Ed25519 Signing)**
   - OpenClaw: Supports device pairing and ephemeral keypairs
   - Ironclaw: Token-based auth only
   - **Workaround**: Use API tokens; no device auth available

3. **Session Key Strategies (issue/fixed/run)**
   - OpenClaw: Three routing modes for session management
   - Ironclaw: Implicit thread-per-conversation model
   - **Workaround**: Each Paperclip agent creates own Ironclaw thread

4. **Multi-Agent Shared Sessions**
   - OpenClaw: One session can route to multiple agents via `agentId`
   - Ironclaw: No agent routing in Responses API
   - **Workaround**: Each agent gets independent thread (acceptable for use case)

5. **Auto-Pairing Flow (device.pair.list/device.pair.approve)**
   - OpenClaw: Automatic device registration on first connect
   - Ironclaw: Not applicable (no device auth)
   - **Workaround**: Pre-create API tokens; provide to adapter config

### Workarounds Implemented

1. **HTTP Instead of WebSocket**: Simpler, cleaner, uses public API
2. **Token-Based Auth Only**: Documented in config, no pairing workflow
3. **Thread-Per-Agent Model**: Each Paperclip agent gets own Ironclaw conversation thread
4. **Hardcoded Built-in Tools**: For MVP, expose standard tool set; extensibility TBD

### Future Enhancements

1. **WebSocket Support**: If real-time streaming needed
2. **Tool Discovery API**: Query Ironclaw for available extensions (beyond built-in)
3. **Approval Gate Handling**: Better UX for tools requiring approval
4. **Thread Management UI**: Allow users to manage/inspect Ironclaw threads
5. **Provider-Aware Model Selection**: Extract LLM provider from model name or API

---

## Assumptions & Unknowns (Updated)

### Confirmed Assumptions ✅
1. ✅ Ironclaw supports HTTP Responses API (`/api/v1/responses`)
2. ✅ Dynamic model discovery via `POST /api/webchat/v2/llm/list-models`
3. ✅ Built-in tools available through agentic loop
4. ✅ 3-tier token authentication supported
5. ✅ Session continuity via `previous_response_id`
6. ✅ WebSocket gateway available (can be used for advanced features later)

### Remaining Questions ❓
1. **Tool Approval Gates**: How should adapter handle `requires_approval` responses?
2. **Provider Extraction**: Can we reliably extract LLM provider from model string?
3. **Thread Lifecycle**: Should adapter manage thread cleanup, or let Ironclaw handle?
4. **Custom Tools/Extensions**: How do users add custom tools to Ironclaw for use via Paperclip?
5. **Real-Time Requirements**: Is HTTP polling sufficient, or do we need streaming?

---

## Timeline & Deliverables

| Phase | Duration | Status | Key Deliverables |
|-------|----------|--------|-----------------|
| Phase 1 | 1 day | ✅ Complete | Paperclip docs, initial analysis |
| Phase 2 | 1 day | ✅ Complete | Ironclaw analysis, API mapping, architecture decision |
| Phase 3 | 1 day | ⏳ Next | Detailed implementation spec |
| Phase 4 | 5-7 days | Not started | HTTP Responses API adapter complete |
| Phase 5 | 3-5 days | Not started | Integration & system tests |
| Phase 6 | 2-3 days | Not started | Performance, security review |

**Total Estimated Duration**: 2-3 weeks (accelerated due to clear architecture path)

**Key Milestone**: Phase 3 completion provides exact implementation tasks and timeline adjustments

---

## Next Steps

1. **Confirm** this phase plan with stakeholder
2. **Proceed to Phase 1.1**: Gather documentation from Paperclip & Ironclaw docs
3. **Clarify** unknowns as documentation becomes available
4. **Adjust** timeline based on documentation findings
