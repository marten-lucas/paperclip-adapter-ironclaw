/**
 * Unit tests for testEnvironment function
 */

import { describe, it, after } from "node:test";
import assert from "node:assert";
import type { AdapterEnvironmentTestContext } from "@paperclipai/adapter-utils";
import { testEnvironment } from "./test.js";

const originalFetch = global.fetch;

function setupMockFetch(
  impl: (input: string | Request, init?: RequestInit) => Promise<Response>
) {
  (global as any).fetch = impl;
}

function resetMockFetch() {
  (global as any).fetch = originalFetch;
}

function createTestContext(
  config: Record<string, unknown>
): AdapterEnvironmentTestContext {
  return {
    companyId: "test_company",
    adapterType: "ironclaw_http",
    config,
  };
}

describe("testEnvironment Function", () => {
  after(() => {
    resetMockFetch();
  });

  it("should fail when url is missing", async () => {
    const result = await testEnvironment(
      createTestContext({ authToken: "token" })
    );
    assert.strictEqual(result.status, "fail");
    const check = result.checks.find((c) => c.code === "ironclaw_url_missing");
    assert.ok(check);
  });

  it("should fail when authToken is missing", async () => {
    const result = await testEnvironment(
      createTestContext({ url: "http://localhost:3000" })
    );
    assert.strictEqual(result.status, "fail");
    const check = result.checks.find((c) => c.code === "ironclaw_auth_missing");
    assert.ok(check);
  });

  it("should reject invalid URL format", async () => {
    const result = await testEnvironment(
      createTestContext({
        url: "not-a-url",
        authToken: "token",
      })
    );
    assert.strictEqual(result.status, "fail");
    const check = result.checks.find((c) => c.code === "ironclaw_url_invalid");
    assert.ok(check);
  });

  it("should pass with valid config and models", async () => {
    setupMockFetch(async () => {
      return new Response(
        JSON.stringify({ models: ["gpt-4", "gpt-3.5"] }),
        { status: 200 }
      );
    });

    const result = await testEnvironment(
      createTestContext({
        url: "http://localhost:3000",
        authToken: "token",
      })
    );
    assert.strictEqual(result.status, "pass");
  });

  it("should warn when connected but no models", async () => {
    setupMockFetch(async () => {
      return new Response(JSON.stringify({ models: [] }), { status: 200 });
    });

    const result = await testEnvironment(
      createTestContext({
        url: "http://localhost:3000",
        authToken: "token",
      })
    );
    assert.strictEqual(result.status, "warn");
    const check = result.checks.find((c) => c.code === "ironclaw_no_models");
    assert.ok(check);
  });

  it("should include testedAt timestamp", async () => {
    setupMockFetch(async () => {
      return new Response(JSON.stringify({ models: ["gpt-4"] }), {
        status: 200,
      });
    });

    const result = await testEnvironment(
      createTestContext({
        url: "http://localhost:3000",
        authToken: "token",
      })
    );
    assert.ok(result.testedAt);
    assert.ok(new Date(result.testedAt).getTime() > 0);
  });
});
