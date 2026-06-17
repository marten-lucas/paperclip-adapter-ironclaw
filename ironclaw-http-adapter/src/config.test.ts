import test from "node:test";
import assert from "node:assert";
import { configSchema } from "./index.js";

test("configSchema validation", async (t) => {
  await t.test("should define required fields", () => {
    assert.strictEqual(Array.isArray(configSchema.required), true);
    assert.strictEqual(configSchema.required?.includes("url"), true);
    assert.strictEqual(configSchema.required?.includes("authToken"), true);
  });

  await t.test("should define all properties", () => {
    const props = configSchema.properties || {};
    assert.strictEqual(typeof props.url, "object");
    assert.strictEqual(typeof props.authToken, "object");
    assert.strictEqual(typeof props.model, "object");
    assert.strictEqual(typeof props.timeout, "object");
    assert.strictEqual(typeof props.stream, "object");
    assert.strictEqual(typeof props.pollInterval, "object");
    assert.strictEqual(typeof props.tools, "object");
    assert.strictEqual(typeof props.instructions, "object");
  });

  await t.test("url should require HTTP/HTTPS", () => {
    const urlProp = configSchema.properties?.url as any;
    assert.strictEqual(urlProp.type, "string");
    assert.strictEqual(urlProp.pattern, "^https?://.*");
    assert.strictEqual(urlProp.title, "Ironclaw URL");
  });

  await t.test("authToken should be marked as secret", () => {
    const tokenProp = configSchema.properties?.authToken as any;
    assert.strictEqual(tokenProp.type, "string");
    assert.strictEqual(tokenProp.secret, true);
    assert.strictEqual(tokenProp.title, "API Token");
  });

  await t.test("timeout should have numeric constraints", () => {
    const timeoutProp = configSchema.properties?.timeout as any;
    assert.strictEqual(timeoutProp.type, "number");
    assert.strictEqual(timeoutProp.minimum, 1);
    assert.strictEqual(timeoutProp.maximum, 3600);
    assert.strictEqual(timeoutProp.default, 120);
  });

  await t.test("pollInterval should have valid range", () => {
    const pollProp = configSchema.properties?.pollInterval as any;
    assert.strictEqual(pollProp.type, "number");
    assert.strictEqual(pollProp.minimum, 100);
    assert.strictEqual(pollProp.maximum, 10000);
    assert.strictEqual(pollProp.default, 1000);
  });

  await t.test("stream should be boolean with default false", () => {
    const streamProp = configSchema.properties?.stream as any;
    assert.strictEqual(streamProp.type, "boolean");
    assert.strictEqual(streamProp.default, false);
  });

  await t.test("model should be optional string", () => {
    const modelProp = configSchema.properties?.model as any;
    assert.strictEqual(modelProp.type, "string");
    assert.strictEqual(configSchema.required?.includes("model"), false);
  });

  await t.test("tools should be array of strings", () => {
    const toolsProp = configSchema.properties?.tools as any;
    assert.strictEqual(toolsProp.type, "array");
    assert.strictEqual(toolsProp.items?.type, "string");
  });

  await t.test("instructions should be optional string with multiline support", () => {
    const instrProp = configSchema.properties?.instructions as any;
    assert.strictEqual(instrProp.type, "string");
    assert.strictEqual(instrProp.multiline, true);
    assert.strictEqual(configSchema.required?.includes("instructions"), false);
  });

  await t.test("schema type should be object", () => {
    assert.strictEqual(configSchema.type, "object");
  });

  await t.test("all properties should have descriptions", () => {
    const props = configSchema.properties || {};
    Object.entries(props).forEach(([key, prop]: [string, any]) => {
      assert.strictEqual(
        typeof prop.description,
        "string",
        `Property ${key} should have a description`
      );
      assert.strictEqual(
        typeof prop.title,
        "string",
        `Property ${key} should have a title`
      );
    });
  });
});
