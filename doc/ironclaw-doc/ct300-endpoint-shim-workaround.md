# CT300 Ironclaw Endpoint Shim Workaround

## Problem

Paperclip external adapters and newer Ironclaw builds disagree on at least one API path used for model discovery.

Observed mismatch:

- Adapter / older docs expect: `POST /api/webchat/v2/llm/list-models`
- Current Ironclaw on CT201 exposes: `POST /api/llm/list_models`

Impact:

- direct calls to the older endpoint return `404`
- adapter metadata can show `0 models`
- environment tests can warn about missing models even when Ironclaw is healthy

## Why CT300 Is A Good Place For The Workaround

CT300 already hosts a dedicated compatibility/filter layer for Ollama.

- Traefik handles external routing
- a local FastAPI service performs request/response normalization

Using the same pattern for Ironclaw keeps upstream API quirks out of the adapter and makes the workaround easy to remove later.

## Workaround Design

The Ironclaw shim is intentionally separate from the Ollama filter.

- App directory: `/opt/ironclaw-endpoint-shim`
- Local service port: `127.0.0.1:18081`
- Traefik entrypoint: `:13000`
- External URL: `http://10.12.12.106:13000`

Behavior:

1. Proxy all Ironclaw requests to CT201 (`http://10.12.12.102:3000`)
2. Rewrite `POST /api/webchat/v2/llm/list-models` to `POST /api/llm/list_models`
3. Inject a default body key `adapter: openai-compatible` when absent
4. Normalize the model response back to:

```json
{
  "models": ["..."]
}
```

All other paths are proxied through unchanged.

## Files In This Repo

- `deploy/ct300/ironclaw-endpoint-shim/app.py`
- `deploy/ct300/ironclaw-endpoint-shim/ironclaw-endpoint-shim.service`
- `deploy/ct300/ironclaw-endpoint-shim/traefik-ironclaw-endpoint-shim.yaml`

## Deployment Steps On CT300

1. Copy the app into `/opt/ironclaw-endpoint-shim`
2. Create a Python venv and install `fastapi`, `uvicorn`, and `httpx`
3. Install the systemd unit as `ironclaw-endpoint-shim.service`
4. Add Traefik entrypoint `ironclawcompat: ':13000'`
5. Add the Traefik dynamic config file under `/etc/traefik/conf.d/`
6. Restart `ironclaw-endpoint-shim.service`
7. Restart `traefik.service`

## When To Use It

Point the adapter `url` to the shim URL when you want compatibility behavior without changing Paperclip or the adapter.

Example:

```text
http://10.12.12.106:13000
```

## Limitations

This only solves backend API compatibility.

It does **not** solve the missing adapter config fields in the Paperclip CEO agent configuration page. That issue is in the Paperclip frontend, which currently reads `/api/adapters` summary but does not request `/api/adapters/{type}/config-schema` in that view.

## Removal Plan

Remove this workaround when Ironclaw and the adapter converge on a stable model-discovery endpoint and response shape.
