/**
 * HTTP client for Ironclaw Responses API
 */

import type { IroncrawResponse, RequestPayload, ToolDefinition, ListModelsResponse } from "./types.js";

export interface ExecuteRequestInput {
  url: string;
  authToken: string;
  message: string;
  model?: string;
  instructions?: string;
  tools?: ToolDefinition[];
  previousResponseId?: string;
  timeoutMs?: number;
}

/**
 * Execute a request to Ironclaw Responses API
 */
export async function executeRequest(input: ExecuteRequestInput): Promise<IroncrawResponse> {
  const { url, authToken, message, model, instructions, tools, previousResponseId, timeoutMs = 120000 } = input;

  // Build request payload
  const payload: RequestPayload = {
    input: message,
    model: model || "default",
    instructions,
    tools: tools || [],
    previous_response_id: previousResponseId,
    stream: false, // HTTP polling model (not streaming)
  };

  // Remove undefined fields
  Object.keys(payload).forEach((key) => {
    if (payload[key as keyof RequestPayload] === undefined) {
      delete payload[key as keyof RequestPayload];
    }
  });

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    const response = await fetch(`${url}/api/v1/responses`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${authToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      if (response.status === 401) {
        const error = new Error("ironclaw_auth_failed") as Error & { statusCode?: number };
        error.statusCode = 401;
        throw error;
      }
      if (response.status === 404) {
        const error = new Error("ironclaw_not_found") as Error & { statusCode?: number };
        error.statusCode = 404;
        throw error;
      }
      const error = new Error(`ironclaw_http_error_${response.status}`) as Error & { statusCode?: number };
      error.statusCode = response.status;
      throw error;
    }

    const data = (await response.json()) as IroncrawResponse;
    return data;
  } catch (err) {
    if (err instanceof TypeError && err.message.includes("abort")) {
      const error = new Error("ironclaw_timeout") as Error & { cause?: Error };
      error.cause = err;
      throw error;
    }
    throw err;
  }
}

/**
 * Discover available models from Ironclaw
 */
export async function listModels(input: {
  url: string;
  authToken: string;
  timeoutMs?: number;
}): Promise<string[]> {
  const { url, authToken, timeoutMs = 30000 } = input;
  const modelEndpoints = [
    {
      path: "/api/llm/list_models",
      body: {
        adapter: "openai-compatible",
      },
    },
    {
      path: "/api/webchat/v2/llm/list-models",
      body: {},
    },
  ];

  function normalizeModelList(payload: ListModelsResponse): string[] {
    const raw = payload.models;
    if (Array.isArray(raw)) {
      return raw.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0);
    }

    if (raw && typeof raw === "object") {
      return Object.keys(raw).filter((entry) => entry.trim().length > 0);
    }

    return [];
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    for (const endpoint of modelEndpoints) {
      const response = await fetch(`${url}${endpoint.path}`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${authToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(endpoint.body),
        signal: controller.signal,
      });

      if (!response.ok) {
        // Keep trying fallback routes when endpoint moved between versions.
        continue;
      }

      const data = (await response.json()) as ListModelsResponse;
      const models = normalizeModelList(data);
      if (models.length > 0) {
        clearTimeout(timeoutId);
        return models;
      }
    }

    clearTimeout(timeoutId);
    console.warn("Model discovery did not return any models on supported endpoints");
    return [];
  } catch (err) {
    console.warn(`Model discovery error: ${err instanceof Error ? err.message : String(err)}`);
    return [];
  }
}
