import test from "node:test";
import assert from "node:assert";
import path from "node:path";
import { pathToFileURL } from "node:url";

test("Runtime contract: dist root exports include config schema", async () => {
  const rootModulePath = path.join(process.cwd(), "dist", "index.js");
  const rootModule = (await import(pathToFileURL(rootModulePath).href)) as Record<string, unknown>;

  assert.strictEqual(rootModule.type, "ironclaw_http");
  assert.strictEqual(typeof rootModule.config, "object");

  const config = rootModule.config as { fields?: unknown[] };
  assert.ok(Array.isArray(config.fields), "config.fields must be an array");
  assert.ok((config.fields?.length ?? 0) >= 2, "config.fields should contain required fields");
});

test("Runtime contract: dist ui exports config builders", async () => {
  const uiModulePath = path.join(process.cwd(), "dist", "ui", "index.js");
  const uiModule = (await import(pathToFileURL(uiModulePath).href)) as Record<string, unknown>;

  assert.strictEqual(typeof uiModule.buildIronclawConfig, "function");
  assert.strictEqual(typeof uiModule.buildIronclawHttpConfig, "function");
});