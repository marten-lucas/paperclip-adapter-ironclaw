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

### 4.1 Adapter Base Implementation
**Tasks**:
- [ ] Rename adapter type from openclaw_gateway → ironclaw_gateway
- [ ] Update configuration documentation
- [ ] Adapt gateway client for Ironclaw protocol
- [ ] Implement Ironclaw connect handshake
- [ ] Implement Ironclaw agent request method

### 4.2 Dynamic Discovery Implementation
**Tasks**:
- [ ] Implement model list discovery on adapter init
- [ ] Cache model list with refresh strategy
- [ ] Export discovered models in adapter config
- [ ] Implement tools/capabilities discovery
- [ ] Export tools in adapter config

### 4.3 Session Management
**Tasks**:
- [ ] Verify Ironclaw session key routing
- [ ] Adapt session key prefixing if needed
- [ ] Test multi-agent isolation

### 4.4 Error Handling & Logging
**Tasks**:
- [ ] Adapt error codes from Ironclaw gateway
- [ ] Create Ironclaw-specific log prefixes
- [ ] Handle timeout scenarios

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

### Unable to Migrate
- **[To be determined]**: List will be populated after Phase 2 analysis

### Workarounds Required
- **[To be determined]**: Mitigation strategies for unsupported features

### Future Enhancements
- [ ] Support for Ironclaw webhooks instead of polling
- [ ] Caching layer for model/tools discovery
- [ ] Metrics/observability integration

---

## Assumptions & Unknowns

### Assumptions
1. Ironclaw supports WebSocket gateway protocol (similar to OpenClaw)
2. Ironclaw has agents endpoint for routing requests
3. Ironclaw can provide model list dynamically
4. Ironclaw can provide tools/capabilities list

### Unknowns (To be clarified)
1. **Exact Ironclaw gateway protocol spec** - awaiting documentation review
2. **Model discovery API** - need to check Ironclaw docs
3. **Tools/capabilities API** - need to check Ironclaw docs
4. **Authentication mechanism** - does Ironclaw use same token/device auth?
5. **Session isolation strategy** - how does Ironclaw handle agent context?
6. **Test system access** - when available for Phase 5 testing?

---

## Timeline & Deliverables

| Phase | Duration | Key Deliverables |
|-------|----------|-----------------|
| Phase 1 | 1-2 days | Docs organized, protocol analysis complete |
| Phase 2 | 2-3 days | API mapping complete, protocol decisions made |
| Phase 3 | 1-2 days | Detailed implementation plan, limitations documented |
| Phase 4 | 5-7 days | Adapter implementation complete, unit tests pass |
| Phase 5 | 3-5 days | Integration tests pass, system testing setup ready |
| Phase 6 | 2-3 days | Performance validated, security reviewed |

**Total Estimated Duration**: 2-3 weeks (pending clarifications and test system availability)

---

## Next Steps

1. **Confirm** this phase plan with stakeholder
2. **Proceed to Phase 1.1**: Gather documentation from Paperclip & Ironclaw docs
3. **Clarify** unknowns as documentation becomes available
4. **Adjust** timeline based on documentation findings
