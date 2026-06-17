# Creating a Paperclip Adapter

Source: https://docs.paperclip.ing/reference/adapters/creating-an-adapter.md

## Overview
Build a custom adapter when built-in local adapters don't fit your runtime. This guide covers code shape and runtime contracts.

For installable plugins, also read External Adapters documentation.

## Recommended Package Layout
```
my-adapter/
  package.json
  tsconfig.json
  src/
    index.ts
    server/
      index.ts
      execute.ts
      test.ts
    ui-parser.ts
    cli/
      format-event.ts
```

Keep package self-contained and export metadata and server factory from root.

## Root Metadata (`src/index.ts`)

```typescript
export const type = "my_adapter";
export const label = "My Adapter";
export const models = [{ id: "model-a", label: "Model A" }];
export const agentConfigurationDoc = `# my_adapter agent configuration

Use when:
- ...

Don't use when:
- ...

Core fields:
- ...
`;

export { createServerAdapter } from "./server/index.js";
```

`agentConfigurationDoc` string is what the UI shows when user configures adapter.

## Server Factory

`createServerAdapter()` is the server-side entrypoint and must return `ServerAdapterModule`:

```typescript
import type { ServerAdapterModule } from "@paperclipai/adapter-utils";
import { execute } from "./execute.js";
import { testEnvironment } from "./test.js";

export function createServerAdapter(): ServerAdapterModule {
  return {
    type: "my_adapter",
    execute,
    testEnvironment,
    models: [{ id: "model-a", label: "Model A" }],
    agentConfigurationDoc,
  };
}
```

This module is the contract Paperclip relies on for adapter lifecycle.

## Execute Function

`execute()` receives `AdapterExecutionContext` and returns `AdapterExecutionResult`.

Use it to:
1. Read config with safe helpers from `@paperclipai/adapter-utils/server-utils`
2. Build runtime environment with `buildPaperclipEnv(agent)`
3. Resolve or resume session state from `runtime.sessionParams`
4. Render any prompt template with `renderTemplate()`
5. Spawn command or call remote service
6. Return usage, cost, session, and result metadata

Key helpers:
| Helper | Use |
|---|---|
| `runChildProcess()` | Spawn local command with streaming logs and timeouts |
| `buildPaperclipEnv()` | Inject standard `PAPERCLIP_*` variables |
| `renderTemplate()` | Substitute template variables like `{{agentId}}` |
| `asString()`, `asNumber()`, `asBoolean()` | Read config values safely |

**Important:** Treat adapter output as untrusted. Parse defensively and never execute stdout blindly.

## Environment Test

`testEnvironment()` validates adapter config before run starts.

Use it to check:
- Command or endpoint exists
- Working directory is valid
- Required auth or environment variables present
- Lightweight hello probe succeeds

Return `info`, `warn`, and `error` checks so UI can explain readiness status.

## Session Persistence

If runtime can resume state across heartbeats, persist in `sessionParams` and restore on next wake:

```typescript
export const sessionCodec = {
  deserialize(raw) {
    // Validate raw payload and convert to session params
  },
  serialize(params) {
    // Convert session params back to storable shape
  },
  getDisplayId(params) {
    // Return human-readable label for session
  },
};
```

Use `clearSession: true` when runtime reports previous session cannot resume.

## Skills Injection

Make Paperclip skills visible without polluting workspace.

Preferred options:
1. Create temporary skills directory and pass via CLI flag
2. Symlink into runtime's global skills location
3. Point runtime at managed skills directory with environment variable
4. Fall back to prompt injection only when runtime doesn't support better options

## UI Parser

If adapter needs richer transcript rendering than generic shell parser, ship self-contained `ui-parser.ts`.

For external adapters, must be standalone and browser-safe.

## Security Best Practices
- Keep secrets in environment variables or secret refs, not prompts
- Treat runtime output as untrusted input
- Enforce timeouts and grace periods
- Keep UI parser free of DOM and Node APIs

## External vs Built-In Adapters

| Area | Built-in | External |
|---|---|---|
| Source | Paperclip repo | Separate npm package |
| Installation | Ships with Paperclip | Plugin store |
| Updates | Requires Paperclip release | Independent versioning |
| UI parser | Static import | Optional export |
| Registration | Hardcoded in host | Plugin loader |

For most new integrations, start as external adapter. Move to built-in only if Paperclip needs to ship it.

## External Adapter Package Shape

```json
{
  "name": "my-paperclip-adapter",
  "version": "1.0.0",
  "type": "module",
  "paperclip": {
    "adapterUiParser": "1.0.0"
  },
  "exports": {
    ".": "./dist/index.js",
    "./server": "./dist/server/index.js",
    "./ui-parser": "./dist/ui-parser.js"
  }
}
```

Installation via:
```http
POST /api/adapters/install
Content-Type: application/json

{
  "packageName": "my-paperclip-adapter",
  "version": "latest",
  "isLocalPath": false
}
```

## Adapter Configuration Documentation

The `agentConfigurationDoc` is critical and should include:
- When to use this adapter
- When NOT to use it
- All core fields with types and required flags
- Optional advanced fields
- Example configuration
- Common troubleshooting

This doc appears in the UI when configuring an agent with this adapter type.
