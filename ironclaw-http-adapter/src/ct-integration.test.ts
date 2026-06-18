import test from "node:test";
import assert from "node:assert";

function getRequiredEnv(name: string): string | null {
  const value = process.env[name];
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

async function fetchJson(baseUrl: string, sessionToken: string, path: string): Promise<unknown> {
  const response = await fetch(`${baseUrl}${path}`, {
    headers: {
      Cookie: `paperclip-default.session_token=${sessionToken}`,
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`HTTP ${response.status} for ${path}: ${body.slice(0, 500)}`);
  }

  return response.json();
}

test("CT integration: ironclaw adapter is registered and schema endpoint works", async (t) => {
  const baseUrl = getRequiredEnv("PAPERCLIP_BASE_URL");
  const sessionToken = getRequiredEnv("PAPERCLIP_SESSION_TOKEN");

  if (!baseUrl || !sessionToken) {
    t.skip("Set PAPERCLIP_BASE_URL and PAPERCLIP_SESSION_TOKEN to run CT integration test");
    return;
  }

  const adapters = await fetchJson(baseUrl, sessionToken, "/api/adapters") as Array<{
    type: string;
    source?: string;
    version?: string;
  }>;

  const ironclaw = adapters.find((adapter) => adapter.type === "ironclaw_http");
  assert.ok(ironclaw, "ironclaw_http adapter must be present in /api/adapters");

  const schema = await fetchJson(baseUrl, sessionToken, "/api/adapters/ironclaw_http/config-schema") as {
    fields?: Array<{ key?: string; type?: string; required?: boolean }>;
  };

  assert.ok(Array.isArray(schema.fields), "config schema must return a fields array");
  assert.ok((schema.fields?.length ?? 0) >= 2, "schema must expose adapter configuration fields");

  const urlField = schema.fields?.find((field) => field.key === "url");
  const authTokenField = schema.fields?.find((field) => field.key === "authToken");

  assert.ok(urlField, "schema must include url field");
  assert.ok(authTokenField, "schema must include authToken field");
  assert.strictEqual(urlField?.required, true, "url must be required");
  assert.strictEqual(authTokenField?.required, true, "authToken must be required");
});
