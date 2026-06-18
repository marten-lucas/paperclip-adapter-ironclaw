from __future__ import annotations

import json
from typing import Any

import httpx
from fastapi import FastAPI, Request
from fastapi.responses import Response, StreamingResponse
from starlette.background import BackgroundTask

UPSTREAM = "http://10.12.12.102:3000"
HOP_BY_HOP = {
    "connection",
    "keep-alive",
    "proxy-authenticate",
    "proxy-authorization",
    "te",
    "trailers",
    "transfer-encoding",
    "upgrade",
    "host",
    "content-length",
}

app = FastAPI(title="Ironclaw Endpoint Compatibility Shim")


def filter_headers(headers: httpx.Headers) -> dict[str, str]:
    return {k: v for k, v in headers.items() if k.lower() not in HOP_BY_HOP}


def normalize_list_models_response(payload: Any) -> bytes:
    if isinstance(payload, dict):
        models = payload.get("models")
        if isinstance(models, list):
            return json.dumps({"models": models}).encode("utf-8")
        if isinstance(models, dict):
            return json.dumps({"models": list(models.keys())}).encode("utf-8")
    return json.dumps({"models": []}).encode("utf-8")


@app.api_route("/{path:path}", methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"])
async def proxy(path: str, request: Request):
    incoming_path = f"/{path}"
    upstream_path = incoming_path

    headers = dict(request.headers)
    for header in list(headers.keys()):
        if header.lower() in HOP_BY_HOP:
            headers.pop(header, None)

    content = await request.body()

    if request.method == "POST" and incoming_path == "/api/webchat/v2/llm/list-models":
        upstream_path = "/api/llm/list_models"
        ctype = request.headers.get("content-type", "")
        if "application/json" in ctype.lower() and content:
            try:
                payload = json.loads(content.decode("utf-8"))
            except Exception:
                payload = {}
        else:
            payload = {}

        if not isinstance(payload, dict):
            payload = {}

        payload.setdefault("adapter", "openai-compatible")
        content = json.dumps(payload).encode("utf-8")
        headers["content-type"] = "application/json"

    upstream_url = f"{UPSTREAM}{upstream_path}"

    timeout = httpx.Timeout(180.0, connect=10.0)
    async with httpx.AsyncClient(timeout=timeout) as client:
        req = client.build_request(
            request.method,
            upstream_url,
            params=request.query_params,
            headers=headers,
            content=content if request.method not in {"GET", "HEAD"} else None,
        )
        resp = await client.send(req, stream=True)

        if incoming_path == "/api/webchat/v2/llm/list-models" and resp.status_code < 300:
            raw = await resp.aread()
            return Response(
                content=normalize_list_models_response(json.loads(raw.decode("utf-8")) if raw else {}),
                status_code=resp.status_code,
                headers=filter_headers(resp.headers),
                media_type="application/json",
            )

        async def iter_bytes():
            async for chunk in resp.aiter_raw():
                yield chunk

        if request.method == "HEAD":
            return Response(
                status_code=resp.status_code,
                headers=filter_headers(resp.headers),
                background=BackgroundTask(resp.aclose),
            )

        return StreamingResponse(
            iter_bytes(),
            status_code=resp.status_code,
            headers=filter_headers(resp.headers),
            media_type=resp.headers.get("content-type"),
            background=BackgroundTask(resp.aclose),
        )
