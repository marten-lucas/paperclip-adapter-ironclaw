# Ironclaw HTTP Adapter for Paperclip

Paperclip adapter for integrating with [Ironclaw](https://github.com/nearai/ironclaw) AI agent system via HTTP REST API.

## Features

- **HTTP REST API Integration**: Uses Ironclaw's `/api/v1/responses` endpoint
- **Dynamic Model Discovery**: Automatically discovers available models via `/api/webchat/v2/llm/list-models`
- **Thread-based Sessions**: Each Paperclip agent creates its own Ironclaw thread for conversation continuity
- **Tool Call Support**: Handles Ironclaw tool invocations and result returns
- **Bearer Token Authentication**: Simple token-based security

## Installation

```bash
npm install @paperclipai/adapter-ironclaw-http
```

## Configuration

Required fields:
- `url` - Ironclaw instance URL (e.g., `http://10.12.12.102:3000`)
- `authToken` - Bearer token for API authentication

Optional fields:
- `model` - Default LLM model (defaults to Ironclaw's configured default)
- `timeout` - Request timeout in seconds (default: 120)

## Example

```typescript
const adapter = createServerAdapter();

const result = await adapter.execute({
  agent: { id: "agent-123" },
  agentConfig: {
    url: "http://ironclaw.example.com",
    authToken: "bearer_token_here",
    model: "gpt-4",
  },
  input: {
    type: "text",
    value: "What is the capital of France?",
  },
  runId: "run-456",
  onLog: async (level, message, data) => {
    console.log(`[${level}] ${message}`, data);
  },
});
```

## Architecture

```
User Input
    ↓
execute() → Validate config → Discover models (cached)
    ↓
buildRequest() → Serialize message + tools
    ↓
fetch() → POST /api/v1/responses
    ↓
parseResponse() → Extract output, usage, tool calls
    ↓
Return result to Paperclip
```

## Session Management

Sessions are thread-based in Ironclaw:
- First request: No `previous_response_id`
- Subsequent requests: Use `response.id` as `previous_response_id`
- Ironclaw maintains conversation history per thread

## Error Handling

- **401 Unauthorized**: Invalid auth token
- **404 Not Found**: Model not found or endpoint missing
- **500+**: Ironclaw server error
- **Timeout**: Request exceeded configured timeout

## Development

```bash
# Build
npm run build

# Type check
npm run typecheck

# Test
npm test
```

## License

MIT
