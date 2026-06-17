# Documentation Status & Analysis

## ✅ Paperclip Documentation (Complete)
Saved in `/doc/paperclip-doc/`:
- `openclaw-gateway-adapter.md` - OpenClaw Gateway reference implementation
- `creating-an-adapter.md` - Adapter development guide

### Key Paperclip Findings

**Adapter Contract:**
- `type`: adapter identifier (string)
- `label`: display name
- `models`: array of available models
- `agentConfigurationDoc`: user-facing configuration documentation
- `createServerAdapter()`: factory returning ServerAdapterModule

**OpenClaw Gateway Pattern (to adapt for Ironclaw):**
- WebSocket transport (`ws://` or `wss://`)
- Challenge-connect-agent-wait flow
- Ed25519 device authentication
- Session key routing (issue/fixed/run strategies)
- Token-based auth with optional device pairing
- Streams `event agent` frames for logging

**Adapter Execute Function Must:**
- Read configuration safely
- Build Paperclip environment
- Handle session persistence
- Stream output asynchronously
- Return usage/cost metadata
- Handle errors and timeouts

---

## ⚠️ Ironclaw Documentation (Incomplete)

### What We've Found
- **Introduction**: Secure, open-source AI agent framework built in Rust
- **Multi-Provider LLM**: Supports 7+ providers (NEAR AI, Anthropic, OpenAI, Ollama, Tinfoil, etc.)
- **Key Features**: Extensions (tools), Parallel Jobs, Persistent Memory, Multi-Channel Access
- **Channels**: Web browser, Telegram, terminal UI, HTTP webhooks
- **MCP Server**: Available at https://docs.ironclaw.com/mcp with tools:
  - `search_iron_claw` - search documentation
  - `query_docs_filesystem_iron_claw` - query/read documentation pages

### What We Still Need

**Critical for Implementation:**

1. **Gateway Protocol Specification**
   - WebSocket protocol version (is it OpenClaw-compatible?)
   - Frame types (request/response/event formats)
   - Connect handshake sequence
   - Authentication mechanisms
   - Error codes and handling

2. **Agents Endpoint**
   - How to list/query available agents in Ironclaw
   - Request/response format
   - How does Ironclaw identify agents

3. **Model Discovery API**
   - Endpoint to list available models
   - Response format (name, id, provider, capabilities?)
   - Real-time vs cached vs batch discovery
   - Per-agent models vs global models

4. **Tools/Skills/Extensions API**
   - How to query available tools from Ironclaw
   - Response format for each tool (name, description, parameters?)
   - How to map to Paperclip skills/tools format
   - Per-agent tools vs global tools

5. **Request/Response Format**
   - Agent request structure (message, parameters, etc.)
   - Response structure (result, metadata, etc.)
   - Event/stream format for multi-step operations
   - Timeout handling

6. **Authentication**
   - Token-based? Certificate-based?
   - Device pairing/registration required?
   - Multi-auth modes supported?
   - First-time auth flow

7. **Session Management**
   - How are sessions created/managed?
   - Session isolation between agents?
   - Memory/context persistence across requests?

---

## Next Steps

To proceed with implementation, we need:

**Option 1: Access to Ironclaw Documentation**
- Direct links to gateway protocol docs
- API reference for agents, models, tools endpoints
- Example requests/responses

**Option 2: Access to Ironclaw Source Code**
- Gateway implementation
- Agent request handling
- Protocol definition files

**Option 3: Running Ironclaw Instance**
- Inspect live API endpoints
- Test protocol with WebSocket client
- Verify request/response formats

**Option 4: Ironclaw Team Input**
- Architecture overview document
- Gateway protocol specification
- Model/tools discovery mechanism explanation

---

## Assumptions for Development (to be verified)

1. ✓ **WebSocket Gateway**: Likely uses WebSocket like OpenClaw
2. ❓ **Frame Protocol**: May use same frame format or differ
3. ❓ **Agent Routing**: How agents are identified/selected
4. ❓ **Model Discovery**: API vs static config
5. ❓ **Tools Discovery**: API vs static config
6. ❓ **Device Auth**: Supported like OpenClaw or simpler?
7. ❓ **Session Isolation**: Per-agent session support

---

## Development Strategy (Ready to Execute)

### Phase 1: Protocol Analysis ✓ (Paperclip side done)
- [x] Analyze OpenClaw Gateway (reference implementation)
- [ ] Analyze Ironclaw Gateway (awaiting docs/access)

### Phase 2: API Mapping (Blocked on Ironclaw docs)
- [ ] Map OpenClaw → Ironclaw gateway protocol
- [ ] Map OpenClaw → Ironclaw agent request/response
- [ ] Find Ironclaw model discovery mechanism
- [ ] Find Ironclaw tools discovery mechanism

### Phase 3: Implementation (Can start once Phase 2 complete)
- [ ] Rename adapter type
- [ ] Adapt gateway client for Ironclaw
- [ ] Implement model discovery
- [ ] Implement tools discovery
- [ ] Add comprehensive tests

### Phase 4+: Testing & Optimization
- [ ] Local unit tests
- [ ] Integration tests with mock Ironclaw
- [ ] System tests with real Ironclaw instance (when available)

---

## Questions for Clarification

Please provide:

1. **Gateway Protocol**: Is Ironclaw using the same OpenClaw Gateway WebSocket protocol, or a custom one?
2. **Model Discovery**: How should we discover available models from Ironclaw? Is there an API endpoint?
3. **Tools/Extensions**: How should we query available tools from Ironclaw? What's the response format?
4. **Agent Model**: In Ironclaw, how are agents identified and created? Is there an agents endpoint?
5. **Shared Adapter Pattern**: Should one Ironclaw instance serve all Paperclip agents, or one instance per agent?
6. **Authentication**: What auth methods does Ironclaw gateway support?
7. **Documentation Access**: Can you provide direct links to Ironclaw gateway and API documentation?

---

## Files Created

✓ `/doc/paperclip-doc/openclaw-gateway-adapter.md` - Reference implementation details
✓ `/doc/paperclip-doc/creating-an-adapter.md` - Adapter development guide
⏳ `/doc/ironclaw-doc/` - Awaiting documentation

See `DEVELOPMENT_PLAN.md` for full implementation roadmap.
