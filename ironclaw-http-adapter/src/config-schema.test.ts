import test from "node:test";
import assert from "node:assert";
import { getConfigSchema } from "./server/config-schema.js";
import { buildIronclawConfig } from "./ui/build-config.js";

test("Config Schema Tests", async (t) => {
  let schema: any;

  await t.test("getConfigSchema should return valid structure", async () => {
    schema = getConfigSchema();
    assert.strictEqual(typeof schema, "object");
    assert.strictEqual(Array.isArray(schema.fields), true);
    assert.strictEqual(schema.fields.length, 8);
  });

  await t.test("should define required fields", async () => {
    const requiredFields = schema.fields.filter((f: any) => f.required);
    const requiredKeys = requiredFields.map((f: any) => f.key);
    assert.strictEqual(requiredKeys.includes("url"), true);
    assert.strictEqual(requiredKeys.includes("authToken"), true);
  });

  await t.test("all fields should have key, label, and type", async () => {
    schema.fields.forEach((field: any) => {
      assert.strictEqual(typeof field.key, "string");
      assert.strictEqual(typeof field.label, "string");
      assert.strictEqual(typeof field.type, "string");
    });
  });

  await t.test("url field should be text type", async () => {
    const urlField = schema.fields.find((f: any) => f.key === "url");
    assert.strictEqual(urlField.type, "text");
    assert.strictEqual(urlField.required, true);
    assert.strictEqual(typeof urlField.hint, "string");
  });

  await t.test("authToken field should be text type with secret metadata", async () => {
    const authField = schema.fields.find((f: any) => f.key === "authToken");
    assert.strictEqual(authField.type, "text");
    assert.strictEqual(authField.required, true);
    assert.strictEqual(authField.meta?.secret, true);
  });

  await t.test("model field should be optional text", async () => {
    const modelField = schema.fields.find((f: any) => f.key === "model");
    assert.strictEqual(modelField.type, "text");
    assert.strictEqual(modelField.required, undefined);
  });

  await t.test("timeout should have numeric type and constraints", async () => {
    const timeoutField = schema.fields.find((f: any) => f.key === "timeout");
    assert.strictEqual(timeoutField.type, "number");
    assert.strictEqual(timeoutField.default, 120);
    assert.strictEqual(timeoutField.meta?.min, 1);
    assert.strictEqual(timeoutField.meta?.max, 3600);
  });

  await t.test("stream should be toggle type with default false", async () => {
    const streamField = schema.fields.find((f: any) => f.key === "stream");
    assert.strictEqual(streamField.type, "toggle");
    assert.strictEqual(streamField.default, false);
  });

  await t.test("pollInterval should be number with range constraints", async () => {
    const pollField = schema.fields.find((f: any) => f.key === "pollInterval");
    assert.strictEqual(pollField.type, "number");
    assert.strictEqual(pollField.default, 1000);
    assert.strictEqual(pollField.meta?.min, 100);
    assert.strictEqual(pollField.meta?.max, 10000);
  });

  await t.test("tools field should be text type", async () => {
    const toolsField = schema.fields.find((f: any) => f.key === "tools");
    assert.strictEqual(toolsField.type, "text");
  });

  await t.test("instructions field should be textarea type", async () => {
    const instrField = schema.fields.find((f: any) => f.key === "instructions");
    assert.strictEqual(instrField.type, "textarea");
  });

  await t.test("all fields should have descriptive hints", async () => {
    schema.fields.forEach((field: any) => {
      assert.strictEqual(typeof field.hint, "string");
      assert.strictEqual(field.hint.length > 0, true);
    });
  });
});

test("Build Config Tests", async (t) => {
  await t.test("should handle empty values", () => {
    const config = buildIronclawConfig({} as any);
    assert.strictEqual(typeof config, "object");
  });

  await t.test("should extract url from schema values", () => {
    const config = buildIronclawConfig({
      adapterSchemaValues: { url: "http://localhost:8080" },
    } as any);
    assert.strictEqual(config.url, "http://localhost:8080");
  });

  await t.test("should extract authToken from schema values", () => {
    const config = buildIronclawConfig({
      adapterSchemaValues: { authToken: "test-token" },
    } as any);
    assert.strictEqual(config.authToken, "test-token");
  });

  await t.test("should convert timeout to number and constrain it", () => {
    const config = buildIronclawConfig({
      adapterSchemaValues: { timeout: 300 },
    } as any);
    assert.strictEqual(config.timeout, 300);

    const config2 = buildIronclawConfig({
      adapterSchemaValues: { timeout: 5000 },
    } as any);
    assert.strictEqual(config2.timeout, 3600); // Constrained to max
  });

  await t.test("should convert pollInterval and constrain it", () => {
    const config = buildIronclawConfig({
      adapterSchemaValues: { pollInterval: 500 },
    } as any);
    assert.strictEqual(config.pollInterval, 500);

    const config2 = buildIronclawConfig({
      adapterSchemaValues: { pollInterval: 50 },
    } as any);
    assert.strictEqual(config2.pollInterval, 100); // Constrained to min
  });

  await t.test("should convert stream to boolean", () => {
    const config = buildIronclawConfig({
      adapterSchemaValues: { stream: true },
    } as any);
    assert.strictEqual(config.stream, true);

    const config2 = buildIronclawConfig({
      adapterSchemaValues: { stream: "false" },
    } as any);
    assert.strictEqual(config2.stream, false);
  });

  await t.test("should parse comma-separated tools", () => {
    const config = buildIronclawConfig({
      adapterSchemaValues: { tools: "tool1, tool2, tool3" },
    } as any);
    assert.deepStrictEqual(config.tools, ["tool1", "tool2", "tool3"]);
  });

  await t.test("should handle array tools", () => {
    const config = buildIronclawConfig({
      adapterSchemaValues: { tools: ["tool1", "tool2"] },
    } as any);
    assert.deepStrictEqual(config.tools, ["tool1", "tool2"]);
  });

  await t.test("should trim whitespace from url", () => {
    const config = buildIronclawConfig({
      adapterSchemaValues: { url: "  http://localhost:8080  " },
    } as any);
    assert.strictEqual(config.url, "http://localhost:8080");
  });

  await t.test("should trim instructions", () => {
    const config = buildIronclawConfig({
      adapterSchemaValues: { instructions: "  Be helpful  " },
    } as any);
    assert.strictEqual(config.instructions, "Be helpful");
  });

  await t.test("should handle undefined adapterSchemaValues gracefully", () => {
    const config = buildIronclawConfig({ model: "gpt-4" } as any);
    assert.strictEqual(typeof config, "object");
  });
});
