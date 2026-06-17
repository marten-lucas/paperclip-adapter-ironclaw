# Phase 3: Detailed Implementation Specification

**Status**: Ready for Phase 4 development
**Timeline**: Following this spec, Phase 4 implementation should take 5-7 days

---

## 1. Adapter Metadata & Configuration

### File: `src/index.ts`

**Purpose**: Export adapter type, label, models, and configuration documentation

```typescript
export const type = "ironclaw_gateway";  // Changed from openclaw_gateway
export const label = "Ironclaw Gateway";
export const models: { id: string; label: string }[] = [];  // To be populated at runtime

export const agentConfigurationDoc = `# ironclaw_gateway agent configuration

Use when:
- You want Paperclip to invoke Ironclaw over the HTTP Responses API
- You have an Ironclaw instance running with WebUI accessible
- You want native Ironclaw tool and model integration

Don't use when:
- Your Ironclaw instance is not accessible over HTTP(S)
- You need WebSocket-only streaming (HTTP polling is sufficient for most use cases)
- You want to manage Ironclaw agents directly (use Ironclaw web UI instead)

Core fields:
- url (string, required): Ironclaw gateway URL (http:// or https://)
  Example: https://ironclaw.example.com or http://10.12.12.102:3000

- authToken (string, required): Ironclaw API token
  Create via: POST /api/tokens with GATEWAY_AUTH_TOKEN

- model (string, optional): Default LLM model to use
  If not specified, Ironclaw will use its configured default
  Available models discovered at adapter initialization

- timeout (number, optional): Request timeout in seconds (default: 120)

- pollInterval (number, optional): SSE polling interval in ms (default: 1000)
  Only used if streaming is enabled

Advanced fields:
- stream (boolean, optional): Enable SSE streaming for real-time updates (default: false)
  Note: Streaming requires additional SSE polling logic

- tools (string[], optional): Explicitly enabled tools (default: all built-in)
  Built-in tools: file_read, file_write, shell_execute, web_fetch, memory_save, json_parse, etc.

- instructions (string, optional): System message template for all requests
  Supports template variables: {{agentId}}, {{runId}}, etc.

`;

export { createServerAdapter } from "./server/index.js";
```

**Expected Behavior**:
- On adapter load: `models` array is empty (will be populated at runtime)
- After first `execute()` call: models are discovered via API and cached
- Cache expires after 1 hour (TTL)
- If model discovery fails, adapter continues with empty models list (non-blocking)

---

## 2. Server Factory & Module Exports

### File: `src/server/index.ts`

```typescript
import type { ServerAdapterModule } from "@paperclipai/adapter-utils";
import { execute } from "./execute.js";
import { testEnvironment } from "./test.js";
import { type, label, models, agentConfigurationDoc } from "../index.js";

export function createServerAdapter(): ServerAdapterModule {
  return {
    type,
    execute,
    testEnvironment,
    models,  // Note: Static at init, but will be updated by execute()
    agentConfigurationDoc,
  };
}
```

---

## 3. HTTP Client & Request Builder

### File: `src/server/client.ts` (New)

**Responsibility**: Build and execute HTTP requests to Ironclaw Responses API

```typescript
export interface IroncrawResponses API {
  execute(request: {
    url: string;
    authToken: string;
    message: string;
    model?: string;
    instructions?: string;
    tools?: ToolDefinition[];
    previousResponseId?: string;
    timeoutMs?: number;
  }): Promise<ResponseAPIResult>;

  listModels(config: {
    url: string;
    authToken: string;
    timeoutMs?: number;
  }): Promise<string[]>;
}

export interface ResponseAPIResult {
  id: string;  // response_id (thread UUID)
  model: string;
  status: "completed" | "requires_approval" | "tool_call_pending";
  output: ResponseOutput[];
  usage: {
    input_tokens: number;
    output_tokens: number;
    total_tokens: number;
  };
  error?: {
    code: string;
    message: string;
  };
  pending_tool_call?: {
    call_id: string;
    name: string;
    arguments: Record<string, unknown>;
  };
}

export interface ResponseOutput {
  type: "message" | "function_call";
  role?: "user" | "assistant";
  content?: string | ToolCall;
}

export interface ToolCall {
  call_id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export async function executeRequest(config: {
  url: string;
  authToken: string;
  message: string;
  model?: string;
  instructions?: string;
  tools?: ToolDefinition[];
  previousResponseId?: string;
  timeoutMs?: number;
}): Promise<ResponseAPIResult> {
  // Build request payload
  const payload = {
    input: config.previousResponseId 
      ? buildContinuationInput(config.message)
      : config.message,
    model: config.model || "default",
    instructions: config.instructions,
    tools: config.tools || [],
    previous_response_id: config.previousResponseId,
    stream: false,  // HTTP polling model
  };

  // Execute HTTP POST
  const response = await fetch(`${config.url}/api/v1/responses`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${config.authToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(config.timeoutMs || 120000),
  });

  if (!response.ok) {
    if (response.status === 401) {
      throw new Error("ironclaw_auth_failed");
    }
    if (response.status === 404) {
      throw new Error("ironclaw_not_found");
    }
    throw new Error(`ironclaw_http_error: ${response.status}`);
  }

  return response.json();
}

export async function listModels(config: {
  url: string;
  authToken: string;
  timeoutMs?: number;
}): Promise<string[]> {
  const response = await fetch(`${config.url}/api/webchat/v2/llm/list-models`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${config.authToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({}),
    signal: AbortSignal.timeout(config.timeoutMs || 30000),
  });

  if (!response.ok) {
    return [];  // Graceful fallback
  }

  const data = await response.json();
  return data.models || [];
}
```

---

## 4. Execute Function (Main Adapter Logic)

### File: `src/server/execute.ts`

**Responsibility**: Implement the adapter contract for Paperclip

```typescript
import type {
  AdapterExecutionContext,
  AdapterExecutionResult,
} from "@paperclipai/adapter-utils";
import {
  asString,
  buildPaperclipEnv,
} from "@paperclipai/adapter-utils/server-utils";
import { executeRequest, listModels } from "./client.js";

// Model discovery cache (1 hour TTL)
const modelCache = {
  models: [] as string[],
  expireAt: 0,
};

export async function execute(context: AdapterExecutionContext): Promise<AdapterExecutionResult> {
  // 1. Read adapter configuration
  const config = {
    url: asString(context.agentConfig.url, ""),
    authToken: asString(context.agentConfig.authToken, ""),
    model: asString(context.agentConfig.model, "default"),
    instructions: asString(context.agentConfig.instructions, ""),
    timeoutSec: asNumber(context.agentConfig.timeoutSec, 120),
  };

  // Validate configuration
  if (!config.url || !config.authToken) {
    return {
      status: "error",
      error: {
        code: "ironclaw_config_missing",
        message: "url and authToken are required",
      },
    };
  }

  // 2. Discover models on first run (or if cache expired)
  if (Date.now() > modelCache.expireAt) {
    try {
      modelCache.models = await listModels({
        url: config.url,
        authToken: config.authToken,
        timeoutMs: 30000,
      });
      modelCache.expireAt = Date.now() + (60 * 60 * 1000);  // 1 hour TTL

      // Update adapter's models export
      const modelsExport = modelCache.models.map(m => ({ id: m, label: m }));
      context.onLog?.({
        level: "info",
        message: `[ironclaw-gateway] Discovered ${modelCache.models.length} models`,
        data: { models: modelCache.models },
      });
    } catch (e) {
      context.onLog?.({
        level: "warn",
        message: `[ironclaw-gateway] Failed to discover models: ${e.message}`,
      });
      // Continue anyway - fallback to default model
    }
  }

  // 3. Build Paperclip environment
  const env = buildPaperclipEnv(context.agent);

  // 4. Get wake text from context
  const wakeText = context.workspaceRuntime?.issueWakePrompt 
    || context.agentConfig.message
    || "Execute the task";

  // 5. Build tool definitions from built-in tools
  const tools = buildBuiltinTools();

  // 6. Get or create session (thread)
  const sessionId = context.runtime.sessionParams?.threadId
    || (await initializeThread(config));

  // 7. Execute request to Ironclaw
  let result;
  try {
    result = await executeRequest({
      url: config.url,
      authToken: config.authToken,
      message: wakeText,
      model: config.model,
      instructions: config.instructions,
      tools,
      previousResponseId: sessionId,
      timeoutMs: config.timeoutSec * 1000,
    });
  } catch (e) {
    return {
      status: "error",
      error: {
        code: "ironclaw_request_failed",
        message: e.message,
      },
    };
  }

  // 8. Handle tool calls (round-trip)
  if (result.pending_tool_call) {
    return handleToolCall(result, config, sessionId, context);
  }

  // 9. Extract response text
  const responseText = result.output
    .filter(o => o.type === "message" && o.role === "assistant")
    .map(o => o.content)
    .join("\n");

  // 10. Return result to Paperclip
  return {
    status: "ok",
    data: {
      text: responseText,
    },
    meta: {
      model: result.model,
      usage: {
        inputTokens: result.usage.input_tokens,
        outputTokens: result.usage.output_tokens,
      },
    },
    sessionParams: {
      threadId: result.id,  // Store thread ID for next request
    },
  };
}

function buildBuiltinTools(): ToolDefinition[] {
  // Return Ironclaw's built-in tools as JSON Schema
  return [
    {
      type: "function",
      name: "file_read",
      description: "Read contents of a file",
      parameters: {
        type: "object",
        properties: { path: { type: "string" } },
        required: ["path"],
      },
    },
    {
      type: "function",
      name: "file_write",
      description: "Write contents to a file",
      parameters: {
        type: "object",
        properties: { path: { type: "string" }, content: { type: "string" } },
        required: ["path", "content"],
      },
    },
    {
      type: "function",
      name: "shell_execute",
      description: "Execute a shell command",
      parameters: {
        type: "object",
        properties: { command: { type: "string" } },
        required: ["command"],
      },
    },
    {
      type: "function",
      name: "web_fetch",
      description: "Fetch a URL",
      parameters: {
        type: "object",
        properties: { url: { type: "string" } },
        required: ["url"],
      },
    },
    // ... more tools
  ];
}

async function initializeThread(config: {
  url: string;
  authToken: string;
}): Promise<string> {
  // Send initial message to create thread
  const result = await executeRequest({
    url: config.url,
    authToken: config.authToken,
    message: "Initialize",
    tools: [],
  });
  return result.id;
}

function handleToolCall(
  result: ResponseAPIResult,
  config: any,
  sessionId: string,
  context: AdapterExecutionContext
): AdapterExecutionResult {
  // Tool execution logic
  // For MVP: return status requiring manual tool execution
  return {
    status: "tool_call_required",
    data: {
      tool: result.pending_tool_call?.name,
      arguments: result.pending_tool_call?.arguments,
    },
    meta: {
      callId: result.pending_tool_call?.call_id,
    },
    sessionParams: {
      threadId: sessionId,
    },
  };
}

export const testEnvironment = async (context: AdapterExecutionContext) => {
  // Validation logic for config
  const checks: EnvironmentCheck[] = [];

  const url = asString(context.agentConfig.url, "");
  const token = asString(context.agentConfig.authToken, "");

  if (!url) {
    checks.push({ level: "error", message: "url is required" });
  } else {
    checks.push({ level: "info", message: `Ironclaw URL: ${url}` });
  }

  if (!token) {
    checks.push({ level: "error", message: "authToken is required" });
  } else {
    checks.push({ level: "info", message: "authToken is configured" });
  }

  // Try to connect
  try {
    const models = await listModels({ url, authToken: token, timeoutMs: 10000 });
    checks.push({
      level: "info",
      message: `Successfully connected. Found ${models.length} models.`,
    });
  } catch (e) {
    checks.push({
      level: "error",
      message: `Connection failed: ${e.message}`,
    });
  }

  return { checks };
};
```

---

## 5. Testing Strategy

### File: `src/server/execute.test.ts`

**Key Test Cases**:
1. ✅ Successful message execution
2. ✅ Model discovery and caching
3. ✅ Authentication failure handling
4. ✅ Timeout handling
5. ✅ Tool call round-trips
6. ✅ Session continuation (previous_response_id)
7. ✅ Token usage tracking
8. ✅ Error response handling

**Mock Ironclaw Responses**:
```typescript
const mockResponses = {
  successResponse: {
    id: "resp_abc123",
    model: "gpt-4",
    status: "completed",
    output: [
      { type: "message", role: "assistant", content: "Hello!" }
    ],
    usage: { input_tokens: 10, output_tokens: 20, total_tokens: 30 }
  },

  toolCallResponse: {
    id: "resp_def456",
    model: "gpt-4",
    status: "tool_call_pending",
    pending_tool_call: {
      call_id: "call_123",
      name: "web_fetch",
      arguments: { url: "https://example.com" }
    }
  },

  modelListResponse: {
    models: ["gpt-4", "gpt-3.5-turbo", "claude-3"]
  }
};
```

---

## 6. Error Handling Map

| Error Scenario | Error Code | HTTP Status | Recovery |
|---|---|---|---|
| Invalid token | `ironclaw_auth_failed` | 401 | Retry with new token |
| Thread not found | `ironclaw_session_expired` | 404 | Create new thread |
| Request timeout | `ironclaw_timeout` | - | Retry or escalate |
| Server error | `ironclaw_server_error` | 500 | Retry with backoff |
| Invalid request | `ironclaw_invalid_request` | 400 | Log and fail |
| Network error | `ironclaw_network_error` | - | Retry |

---

## 7. Configuration Validation

**Required Fields**:
- ✅ `url` - Must be valid HTTP(S) URL
- ✅ `authToken` - Must be non-empty string

**Optional Fields** (with defaults):
- `model` - default: "default"
- `timeout` - default: 120 seconds
- `instructions` - default: empty
- `stream` - default: false

**Validation Logic** (in testEnvironment):
1. Parse URL (must be valid)
2. Verify token is present
3. Attempt connection to `/api/webchat/v2/llm/list-models`
4. Log success or error details

---

## 8. Session Management

### Session State Storage

```typescript
interface SessionState {
  threadId: string;  // Ironclaw response.id
  createdAt: number;
  lastUpdatedAt: number;
  messageCount: number;
  toolCallsPending: boolean;
}
```

### Lifecycle
1. **Creation**: First request creates thread (threadId in response.id)
2. **Persistence**: threadId stored in context.sessionParams
3. **Continuation**: Pass threadId as `previous_response_id` in next request
4. **Expiration**: Ironclaw manages thread cleanup server-side

---

## 9. Deliverables Checklist

**Phase 4 will produce**:
- ✅ `src/index.ts` - Adapter metadata
- ✅ `src/server/index.ts` - Server factory
- ✅ `src/server/client.ts` - HTTP client
- ✅ `src/server/execute.ts` - Main execute logic
- ✅ `src/server/test.ts` - Environment test
- ✅ `src/server/execute.test.ts` - Unit tests
- ✅ `src/server/types.ts` - TypeScript interfaces
- ✅ Updated `package.json` with correct exports
- ✅ `README.md` - Usage documentation
- ✅ Working MVP with model discovery + basic tool support

---

## 10. Success Criteria

Adapter is complete when:
1. ✅ Paperclip can authenticate with Ironclaw
2. ✅ Models are dynamically discovered at startup
3. ✅ Messages sent to Ironclaw return valid responses
4. ✅ Token usage tracked and reported
5. ✅ Tool calls are recognized (round-trip ready)
6. ✅ Session continuity maintained across requests
7. ✅ Error handling prevents crashes
8. ✅ Unit tests pass (80%+ coverage)
9. ✅ Can complete end-to-end test on live Ironclaw instance

---

## Next Steps

👉 **Ready for Phase 4**: Core development can begin immediately

**Estimated Time**: 5-7 development days

**Starting Point**: Begin with `src/server/client.ts` to establish HTTP communication with Ironclaw Responses API
