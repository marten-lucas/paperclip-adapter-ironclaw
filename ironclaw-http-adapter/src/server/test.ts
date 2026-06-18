/**
 * Test environment validation for Ironclaw adapter
 */

import type { AdapterEnvironmentTestContext, AdapterEnvironmentTestResult } from "@paperclipai/adapter-utils";
import { asString } from "@paperclipai/adapter-utils/server-utils";
import { listModels } from "./client.js";
import { refreshAdapterModels } from "./models-cache.js";

function resolveEnvBindingString(
  envConfig: Record<string, unknown>,
  key: string,
): string {
  const raw = envConfig[key];
  if (typeof raw === "string") return raw.trim();
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return "";
  const rec = raw as Record<string, unknown>;
  if (rec.type === "plain" && typeof rec.value === "string") {
    return rec.value.trim();
  }
  return "";
}

function asDirectConfigString(value: unknown): string {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  if (!trimmed) return "";
  // CEO config can contain serialized secret refs for unresolved fields; those
  // are not direct usable values and should fall back to env/process variables.
  if (trimmed.startsWith("{")) {
    try {
      const parsed = JSON.parse(trimmed) as Record<string, unknown>;
      if (parsed.type === "secret_ref") return "";
    } catch {
      // Keep non-JSON-like strings as-is.
    }
  }
  return trimmed;
}

export async function testEnvironment(context: AdapterEnvironmentTestContext): Promise<AdapterEnvironmentTestResult> {
  const checks: Array<{
    code: string;
    level: "info" | "warn" | "error";
    message: string;
    detail?: string | null;
    hint?: string | null;
  }> = [];

  const envConfig =
    typeof context.config?.env === "object" && context.config?.env !== null && !Array.isArray(context.config?.env)
      ? (context.config.env as Record<string, unknown>)
      : {};

  const url = asString(
    asDirectConfigString(context.config?.url),
    resolveEnvBindingString(envConfig, "IRONCLAW_BASE_URL") ||
      process.env.IRONCLAW_BASE_URL ||
      process.env.IRONCLAW_URL ||
      "",
  );
  const authToken = asString(
    asDirectConfigString(context.config?.authToken),
    resolveEnvBindingString(envConfig, "IRONCLAW_API_KEY") ||
      process.env.IRONCLAW_API_KEY ||
      process.env.IRONCLAW_TOKEN ||
      "",
  );

  // Check 1: URL is configured
  if (!url) {
    checks.push({
      code: "ironclaw_url_missing",
      level: "error",
      message: "Missing required configuration: url",
      hint: "Set the Ironclaw instance URL (e.g., http://10.12.12.102:3000)",
    });
  } else {
    // Check 2: URL format is valid
    try {
      new URL(url);
      checks.push({
        code: "ironclaw_url_valid",
        level: "info",
        message: `Valid URL format: ${url}`,
      });
    } catch {
      checks.push({
        code: "ironclaw_url_invalid",
        level: "error",
        message: `Invalid URL format: ${url}`,
        hint: "Use format: http://host:port or https://host",
      });
    }
  }

  // Check 3: Auth token is configured
  if (!authToken) {
    checks.push({
      code: "ironclaw_auth_missing",
      level: "error",
      message: "Missing required configuration: authToken",
      hint: "Set your Ironclaw API bearer token",
    });
  }

  // Check 4: Connection test (only if URL and token are configured)
  if (url && authToken) {
    try {
      const models = await listModels({
        url,
        authToken,
        timeoutMs: 10000,
      });
      refreshAdapterModels(models);

      if (models.length > 0) {
        checks.push({
          code: "ironclaw_connected",
          level: "info",
          message: `Connected to Ironclaw. Discovered ${models.length} models.`,
          detail: models.slice(0, 3).join(", ") + (models.length > 3 ? ", ..." : ""),
        });
      } else {
        checks.push({
          code: "ironclaw_no_models",
          level: "warn",
          message: "Connected to Ironclaw but no models discovered",
          hint: "Verify models are configured in your Ironclaw instance",
        });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);

      if (message.includes("401")) {
        checks.push({
          code: "ironclaw_auth_failed",
          level: "error",
          message: "Authentication failed: Invalid or expired authToken",
          hint: "Verify your API token with Ironclaw admin",
        });
      } else if (message.includes("404")) {
        checks.push({
          code: "ironclaw_endpoint_not_found",
          level: "error",
          message: "Ironclaw endpoint not found (404)",
          hint: "Check that URL points to the correct Ironclaw instance",
        });
      } else if (message.includes("timeout")) {
        checks.push({
          code: "ironclaw_timeout",
          level: "error",
          message: "Connection timeout: Ironclaw instance not responding",
          hint: "Verify instance is running and network connectivity is OK",
        });
      } else {
        checks.push({
          code: "ironclaw_connection_error",
          level: "error",
          message: `Connection error: ${message}`,
        });
      }
    }
  }

  // Determine overall status
  const hasError = checks.some((c) => c.level === "error");
  const status = hasError ? "fail" : checks.some((c) => c.level === "warn") ? "warn" : "pass";

  return {
    adapterType: context.adapterType,
    status,
    checks,
    testedAt: new Date().toISOString(),
  };
}
