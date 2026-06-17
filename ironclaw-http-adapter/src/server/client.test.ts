/**
 * Unit tests for HTTP client
 */

import { describe, it, after } from "node:test";
import assert from "node:assert";
import { executeRequest, listModels } from "./client.js";

const originalFetch = global.fetch;

function setupMockFetch(
  impl: (input: string | Request, init?: RequestInit) => Promise<Response>
) {
  (global as any).fetch = impl;
}

function resetMockFetch() {
  (global as any).fetch = originalFetch;
}

describe("HTTP Client", () => {
  after(() => {
    resetMockFetch();
  });

  it("should send POST to /api/v1/responses endpoint", async () => {
    let capturedUrl = "";
    setupMockFetch(async (input: string | Request) => {
      capturedUrl = typeof input === "string" ? input : input.url;
      return new Response(
        JSON.stringify({
          id: "resp_123",
          model: "gpt-4",
          status: "completed",
          output: [{ type: "message", content: "Hello!" }],
          usage: { input_tokens: 10, output_tokens: 5, total_tokens: 15 },
        }),
        { status: 200 }
      );
    });

    await executeRequest({
      url: "http://localhost:3000",
      authToken: "token123",
      message: "test",
    });

    assert.ok(capturedUrl.includes("/api/v1/responses"));
  });

  it("should discover models via listModels", async () => {
    setupMockFetch(async () => {
      return new Response(
        JSON.stringify({ models: ["gpt-4", "gpt-3.5-turbo"] }),
        { status: 200 }
      );
    });

    const models = await listModels({
      url: "http://localhost:3000",
      authToken: "token",
    });

    assert.deepStrictEqual(models, ["gpt-4", "gpt-3.5-turbo"]);
  });

  it("should handle 401 authentication error", async () => {
    setupMockFetch(async () => {
      return new Response(null, { status: 401 });
    });

    try {
      await executeRequest({
        url: "http://localhost:3000",
        authToken: "bad_token",
        message: "test",
      });
      assert.fail("Should throw");
    } catch (err) {
      assert.strictEqual((err as Error).message, "ironclaw_auth_failed");
    }
  });

  it("should return empty array when model discovery fails", async () => {
    setupMockFetch(async () => {
      return new Response(null, { status: 500 });
    });

    const models = await listModels({
      url: "http://localhost:3000",
      authToken: "token",
    });

    assert.strictEqual(models.length, 0);
  });
});
