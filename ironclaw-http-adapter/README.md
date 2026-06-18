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

# Install Playwright browser deps
npm run e2e:install

# Run browser e2e checks (requires env vars)
npm run test:e2e
```

## Playwright On CT202

The e2e suite is in `e2e/ironclaw-schema-ui.spec.ts` and validates:
- The authenticated schema endpoint for `ironclaw_http`
- Visibility of `Ironclaw URL` and `API Token` on the agent configuration page

Required env vars:
- `PAPERCLIP_BASE_URL` (example: `http://127.0.0.1:3100` inside ct202)
- `PAPERCLIP_SESSION_TOKEN` (authenticated Paperclip session cookie value)
- `PAPERCLIP_AGENT_CONFIG_PATH` (optional, defaults to `/AHOA/agents/ceo/configuration`)

For full end-to-end (including real Ironclaw model discovery):
- `IRONCLAW_E2E_URL` (recommended: CT300 shim `http://10.12.12.106:3000`)
- `IRONCLAW_E2E_TOKEN` (Bearer token accepted by Ironclaw)

If `IRONCLAW_E2E_URL` is not set, the e2e spec falls back to the shim URL. The run fails if no models are discoverable.

Example (inside ct202):

```bash
cd /opt/ironclaw-adapter/ironclaw-http-adapter
npm ci
npm run e2e:install
PAPERCLIP_BASE_URL=http://127.0.0.1:3100 \
PAPERCLIP_SESSION_TOKEN='REDACTED' \
IRONCLAW_E2E_URL=http://10.12.12.106:3000 \
IRONCLAW_E2E_TOKEN='REDACTED' \
npm run test:e2e
```

### Where To Store Credentials

Do not commit credentials to git. Use one of these patterns:

1. Root-only env file on ct202:
```bash
install -d -m 700 /opt/ironclaw-adapter/.secrets
cat >/opt/ironclaw-adapter/.secrets/paperclip-e2e.env <<'EOF'
PAPERCLIP_BASE_URL=http://127.0.0.1:3100
PAPERCLIP_SESSION_TOKEN=REDACTED
PAPERCLIP_AGENT_CONFIG_PATH=/AHOA/agents/ceo/configuration
EOF
chmod 600 /opt/ironclaw-adapter/.secrets/paperclip-e2e.env
set -a; source /opt/ironclaw-adapter/.secrets/paperclip-e2e.env; set +a
npm run test:e2e
```

2. Systemd runtime environment (for scheduled jobs):
- Add env vars in a root-owned systemd drop-in for the e2e runner service
- Keep file permissions `600`

The session token should be a low-privilege user session dedicated to testing.

## License

MIT
