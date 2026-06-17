/**
 * Unit tests for execute function
 */

import { describe, it, after } from "node:test";
import assert from "node:assert";
import type { AdapterExecutionContext } from "@paperclipai/adapter-utils";
import { execute } from "./execute.js";

const originalFetch = global.fetch;

function setupMockFetch(
  impl: (input: string | Request, init?: RequestInit) => Promise<Response>
) {
  (global as any).fetch = impl;
}

function resetMockFetch() {
  (global as any).fetch = originalFetch;
}

function createContext(config: Record<string, unknown>): AdapterExecutionContext {
  return {
    runId: "run_123",
    agent: {
      id: "agent_456",
      companyId: "company",
      name: "Test",
      adapterType: "ironclaw_http",
      adapterConfig: {},
    },
    runtime: {
      sessionId: null,
      sessionParams: null,
      sessionDisplayId: null,
      taskKey: null,
    },
    config,
    context: { input: "test message" },
    onLog: async () => {},
  };
}

describe("Execute Function", () => {
  after(() => {
    resetMockFetch();
  });

  it("should fail if url is missing", async () => {
    const result = await execute(
      createContext({ authToken: "token" })
    );
    assert.strictEqual(result.exitCode, 1);
    assert.strictEqual(result.errorCode, "ironclaw_config_missing");
  });

  it("should fail if authToken is missing", async () => {
    const result = await execute(
      createContext({ url: "http://localhost:3000" })
    );
    assert.strictEqual(result.exitCode, 1);
    assert.strictEqual(result.errorCode, "ironclaw_config_missing");
  });

  it("should successfully execute request", async () => {
    setupMockFetch(async (input: string | Request) => {
      const url = typeof input === "string" ? input : input.url;
      if (url.includes("list-models")) {
        return new Response(JSON.stringify({ models: ["gpt-4"] }), {
          status: 200,
        });
      }
      return new Response(
        JSON.stringify({
          id: "resp_123",
          model: "gpt-4",
          status: "completed",
          output: [{ type: "message", content: "Hello" }],
          usage: { input_tokens: 5, output_tokens: 3, total_tokens: 8 },
        }),
        { status: 200 }
      );
    });

    const result = await execute(
      createContext({
        url: "http://localhost:3000",
        authToken: "token",
      })
    );

    assert.strictEqual(result.exitCode, 0);
    assert.ok(result.resultJson);
  });

  it("should preserve session via sessionParams", async () => {
    setupMockFetch(async (input: string | Request) => {
      const url = typeof input === "string" ? input : input.url;
      if (url.includes("list-models")) {
        return new Response(JSON.stringify({ models: [] }), { status: 200 });
      }
      return new Response(
        JSON.stringify({
          id: "resp_new",
          model: "gpt-4",
          status: "completed",
          output: [],
          usage: { input_tokens: 0, output_tokens: 0, total_tokens: 0 },
        }),
        { status: 200 }
      );
    });

    const result = await execute(
      createContext({
        url: "http://localhost:3000",
        authToken: "token",
      })
    );

    assert.ok(result.sessionParams);
    assert.strictEqual(result.sessionParams.responseId, "resp_new");
  });

  it("should handle API errors", async () => {
    setupMockFetch(async (input: string | Request) => {
      const url = typeof input === "string" ? input : input.url;
      if (url.includes("list-models")) {
        return new Response(JSON.stringify({ models: [] }), { status: 200 });
      }
      return new Response(
        JSON.stringify({
          error: {
            code: "model_not_found",
            message: "Model not available",
          },
        }),
        { status: 200 }
      );
    });

    const result = await execute(
      createContext({
        url: "http://localhost:3000",
        authToken: "token",
      })
    );

    assert.strictEqual(result.exitCode, 1);
    assert.strictEqual(result.errorCode, "model_not_found");
  });
});
