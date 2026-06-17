/**
 * Ironclaw HTTP Adapter for Paperclip
 * 
 * Integrates with Ironclaw AI agent system via HTTP REST API.
 * Each Paperclip agent creates its own Ironclaw thread for conversation continuity.
 */

export const type = "ironclaw_http";
export const label = "Ironclaw (HTTP)";

// Dynamic models array - populated at runtime via model discovery
export const models: Array<{ id: string; label: string }> = [];

export const agentConfigurationDoc = `# ironclaw_http agent configuration

Use when:
- You want Paperclip to invoke Ironclaw over the HTTP REST API
- You have an Ironclaw instance running and accessible over HTTP(S)
- You want native Ironclaw tool and model integration

Don't use when:
- Your Ironclaw instance is not accessible over HTTP(S)
- You need WebSocket streaming (HTTP polling is sufficient for most use cases)
- You want to manage Ironclaw agents directly (use Ironclaw web UI instead)

## Core Configuration Fields

### url (required)
Ironclaw gateway URL for HTTP requests.

Example values:
- \`http://10.12.12.102:3000\` (local development)
- \`https://ironclaw.example.com\` (production)

The adapter will POST to \`{url}/api/v1/responses\` and query models from \`{url}/api/webchat/v2/llm/list-models\`.

### authToken (required)
Bearer token for API authentication.

Create via Ironclaw's token management API or admin panel.
Header format: \`Authorization: Bearer {authToken}\`

## Optional Configuration Fields

### model
Default LLM model to use for this agent.

If not specified, Ironclaw will use its configured default.
Supported models are discovered automatically at adapter initialization.

Example: \`gpt-4\`, \`claude-3-sonnet\`, \`llama-2\`

### timeout
Request timeout in seconds.

Default: 120 (2 minutes)
Range: 1-3600

This is the maximum time to wait for a response from Ironclaw before timing out.

### instructions
System message template for all requests.

Supports Paperclip template variables:
- {{agentId}} - Current agent ID
- {{runId}} - Current run ID
- {{timestamp}} - Current ISO timestamp

Example:
\`\`\`
You are a helpful AI assistant. You are helping user {{agentId}} 
with run {{runId}}. Current time: {{timestamp}}.
\`\`\`

## Advanced Fields

### stream
Enable streaming responses via Server-Sent Events (SSE).

Default: false (HTTP polling)

If enabled, responses are streamed in real-time for better UX.
Requires \`pollInterval\` configuration.

### pollInterval
SSE polling interval in milliseconds (only used if \`stream: true\`).

Default: 1000 (1 second)
Range: 100-10000

Lower values = faster polling = more API requests = higher cost
Higher values = slower updates = fewer API requests = lower cost

### tools
Explicitly enable/disable specific tools.

Default: all built-in tools

Built-in Ironclaw tools:
- file_read - Read file contents
- file_write - Write/create files
- shell_execute - Run shell commands
- web_fetch - Fetch web pages
- memory_save - Store long-term memory
- memory_recall - Retrieve stored memory
- json_parse - Parse/manipulate JSON

Example: ["file_read", "file_write", "web_fetch"]

## Example Configurations

### Basic Configuration
\`\`\`json
{
  "url": "http://10.12.12.102:3000",
  "authToken": "bearer_token_here"
}
\`\`\`

### Production Configuration with Model Override
\`\`\`json
{
  "url": "https://ironclaw.prod.example.com",
  "authToken": "prod_bearer_token",
  "model": "gpt-4-turbo",
  "timeout": 300,
  "instructions": "You are a specialized code review agent for {{agentId}}."
}
\`\`\`

### Advanced Configuration with Streaming
\`\`\`json
{
  "url": "https://ironclaw.example.com",
  "authToken": "bearer_token",
  "model": "claude-3-sonnet",
  "timeout": 180,
  "stream": true,
  "pollInterval": 500,
  "tools": ["file_read", "file_write", "shell_execute"],
  "instructions": "You are an expert DevOps engineer assisting {{agentId}}."
}
\`\`\`

## Testing Your Configuration

The adapter includes a built-in configuration test that:
1. Validates URL format
2. Tests HTTP connectivity to Ironclaw
3. Verifies authentication token
4. Discovers available models
5. Reports any errors for debugging

Run test via the Paperclip UI or API before deploying to production.

## Troubleshooting

### "Authentication failed: Invalid authToken"
- Verify authToken is correct
- Check token hasn't expired
- Verify token has API permissions

### "Ironclaw endpoint not found: Check URL"
- Verify URL is correct and accessible
- Check Ironclaw instance is running
- Verify no firewall blocking access

### "Connection timeout: Ironclaw instance not responding"
- Verify Ironclaw instance is running
- Check network connectivity
- Increase timeout value if Ironclaw is slow

### "No models discovered"
- Verify authToken has permissions to query models
- Check Ironclaw instance has models configured
- Review Ironclaw logs for errors

## Session Management

Each Paperclip agent creates its own Ironclaw thread:
- First request: Thread is created automatically
- Thread ID stored in session data (\`responseId\`)
- Subsequent requests: Use \`responseId\` for thread continuity
- Ironclaw maintains full conversation history per thread

This ensures multi-turn conversations work correctly and context is preserved.

## API Compatibility

This adapter uses Ironclaw's HTTP REST API:
- Responses API: \`POST /api/v1/responses\`
- Models API: \`POST /api/webchat/v2/llm/list-models\`

Requires Ironclaw v0.1.0 or later with REST API support.
`;

export { createServerAdapter } from "./server/index.js";
