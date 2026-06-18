import test from "node:test";
import assert from "node:assert";
import { readFile } from "node:fs/promises";
import path from "node:path";

interface PackageExportsTarget {
  import?: string;
  types?: string;
}

test("Package contract: exports point to dist artifacts", async () => {
  const packageJsonPath = path.join(process.cwd(), "package.json");
  const raw = await readFile(packageJsonPath, "utf8");
  const pkg = JSON.parse(raw) as Record<string, unknown>;

  assert.strictEqual(pkg.main, "./dist/index.js");
  assert.strictEqual(pkg.types, "./dist/index.d.ts");

  const exportsField = pkg.exports as Record<string, PackageExportsTarget>;
  assert.ok(exportsField, "package.json exports is required");

  assert.strictEqual(exportsField["."].import, "./dist/index.js");
  assert.strictEqual(exportsField["."].types, "./dist/index.d.ts");

  assert.strictEqual(exportsField["./server"].import, "./dist/server/index.js");
  assert.strictEqual(exportsField["./server"].types, "./dist/server/index.d.ts");

  assert.strictEqual(exportsField["./ui"].import, "./dist/ui/index.js");
  assert.strictEqual(exportsField["./ui"].types, "./dist/ui/index.d.ts");
});