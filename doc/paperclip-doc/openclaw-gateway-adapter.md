# OpenClaw Gateway Adapter (Paperclip Reference)

Source: https://docs.paperclip.ing/reference/adapters/openclaw-gateway.md

## Overview
`openclaw_gateway` connects Paperclip to an OpenClaw instance over the OpenClaw Gateway WebSocket protocol.

## When To Use
- OpenClaw is reachable over `ws://` or `wss://` (local Docker, remote host, Tailscale)
- You want a shared OpenClaw instance to serve multiple Paperclip agents
- You need device-auth pairing between Paperclip and the gateway

## Transport
Always uses WebSocket gateway transport. URL must start with `ws://` or `wss://`.

### Connection Flow
1. Receive `connect.challenge` from the gateway
2. Send `req connect` with protocol, client, auth, and device payload
3. Send `req agent`
4. Wait for completion via `req agent.wait`
5. Stream `event agent` frames into Paperclip's logs and transcript parser

## Common Configuration Fields

| Field | Required | Notes |
|---|---|---|
| `url` | yes | Gateway WebSocket URL (`ws://` or `wss://`) |
| `authToken` / `token` | no* | Gateway auth token |
| `headers` | no* | Alternative auth: `x-openclaw-token` or `x-openclaw-auth` |
| `password` | no* | Shared-password auth mode |
| `disableDeviceAuth` | no | Omit signed device payload (default: false) |
| `devicePrivateKeyPem` | no | Pins stable Ed25519 signing key; ephemeral if not set |
| `autoPairOnFirstConnect` | no | Handle first `pairing required` (default: true) |
| `sessionKeyStrategy` | no | `issue`, `fixed`, or `run` (default: issue) |
| `sessionKey` | no | Used when `sessionKeyStrategy` is `fixed` |
| `agentId` | no | Optional OpenClaw agent ID to target |
| `payloadTemplate` | no | Fields merged into agent request |
| `timeoutSec` | no | Adapter-level request budget (default: 120) |
| `waitTimeoutMs` | no | `agent.wait.timeoutMs` |

*One of `authToken`/`token`, `headers`, or `password` must be present.

## Device Auth
By default sends a signed `device` payload in `connect` params:
- Generated ephemeral Ed25519 keypair per run (or pinned via `devicePrivateKeyPem`)
- `autoPairOnFirstConnect` enabled by default handles first-time pairing automatically
- If pairing fails, first run returns `pairing required` — approve inside OpenClaw, then retry

## Session Strategy
Three routing models:
- `sessionKeyStrategy=issue` (default) — one OpenClaw session per issue
- `sessionKeyStrategy=fixed` — use single `sessionKey` for every run
- `sessionKeyStrategy=run` — fresh session per run (no memory across heartbeats)

Resolved session key sent as `agent.sessionKey` in each request.

## Payload Mapping
Agent request built with:

**Required:**
- `message` — wake text, optionally prefixed with `payloadTemplate.message` or `payloadTemplate.text`
- `idempotencyKey` — Paperclip's `runId`
- `sessionKey` — resolved from strategy

**Optional:**
- All other `payloadTemplate` fields merged in
- `agentId` injected if configured

## Timeouts
- `timeoutSec` — adapter-level request budget
- `waitTimeoutMs` — per-call `agent.wait.timeoutMs`

If `agent.wait` returns `timeout`, adapter returns `openclaw_gateway_wait_timeout`.

## Log Format
- `[openclaw-gateway] ...` — lifecycle and system logs
- `[openclaw-gateway:event] run=<id> stream=<stream> data=<json>` — `event agent` frames

## Example Configuration
```json
{
  "adapterType": "openclaw_gateway",
  "adapterConfig": {
    "url": "ws://127.0.0.1:18789",
    "headers": {
      "x-openclaw-token": {
        "type": "secret_ref",
        "secretId": "openclaw-gateway-token",
        "version": "latest"
      }
    },
    "devicePrivateKeyPem": "<PEM private key>",
    "autoPairOnFirstConnect": true,
    "sessionKeyStrategy": "issue",
    "timeoutSec": 300,
    "waitTimeoutMs": 60000
  }
}
```
