/**
 * Main adapter execution logic
 */

import type { AdapterExecutionContext, AdapterExecutionResult } from "@paperclipai/adapter-utils";
import { asString, asNumber } from "@paperclipai/adapter-utils/server-utils";
import { executeRequest, listModels } from "./client.js";

// Model discovery cache (1 hour TTL)
const modelCache = {
  models: [] as Array<{ id: string; label: string }>,
  expireAt: 0,
};

export async function execute(context: AdapterExecutionContext): Promise<AdapterExecutionResult> {
  try {
    // 1. Read adapter configuration from context.config
    const url = asString(context.config.url, "");
    const authToken = asString(context.config.authToken, "");
    const model = asString(context.config.model, "default");
    const instructions = asString(context.config.instructions, "");
    const timeoutSec = asNumber(context.config.timeout, 120);

    // Validate configuration
    if (!url || !authToken) {
      return {
        exitCode: 1,
        signal: null,
        timedOut: false,
        errorCode: "ironclaw_config_missing",
        errorMessage: "url and authToken are required",
      };
    }

    // 2. Discover models on first run (or if cache expired)
    if (Date.now() > modelCache.expireAt) {
      try {
        const discoveredModels = await listModels({
          url,
          authToken,
          timeoutMs: 30000,
        });

        modelCache.models = discoveredModels.map((m) => ({
          id: m,
          label: m,
        }));
        modelCache.expireAt = Date.now() + 60 * 60 * 1000; // 1 hour TTL

        await context.onLog(
          "stdout",
          `[ironclaw-http] Discovered ${discoveredModels.length} models\n`,
        );
      } catch (err) {
        await context.onLog(
          "stderr",
          `[ironclaw-http] Failed to discover models: ${err instanceof Error ? err.message : String(err)}\n`,
        );
        // Continue anyway - fallback to default model
      }
    }

    // 3. Get message from context
    let message = "";
    if (typeof context.context.input === "string") {
      message = context.context.input;
    } else {
      message = "Execute the task";
    }

    // 4. Get session ID from runtime (for thread continuity)
    let previousResponseId: string | undefined;
    if (context.runtime.sessionParams && typeof context.runtime.sessionParams === "object") {
      previousResponseId = asString(context.runtime.sessionParams.responseId, "");
    }

    // 5. Execute request to Ironclaw
    await context.onLog(
      "stdout",
      `[ironclaw-http] Sending request (model=${model}, inputLength=${message.length})\n`,
    );

    const response = await executeRequest({
      url,
      authToken,
      message,
      model,
      instructions,
      tools: [],
      previousResponseId,
      timeoutMs: timeoutSec * 1000,
    });

    // 7. Process response
    if (response.error) {
      return {
        exitCode: 1,
        signal: null,
        timedOut: false,
        errorCode: response.error.code,
        errorMessage: response.error.message,
      };
    }

    // Extract text content from response
    let output = "";
    for (const item of response.output) {
      if (item.type === "message" && typeof item.content === "string") {
        output += item.content;
      }
    }

    // 8. Return result with session persistence
    return {
      exitCode: 0,
      signal: null,
      timedOut: false,
      resultJson: {
        output,
        model: response.model,
      },
      usage: response.usage
        ? {
            inputTokens: response.usage.input_tokens,
            outputTokens: response.usage.output_tokens,
          }
        : undefined,
      sessionParams: {
        responseId: response.id,
      },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await context.onLog(
      "stderr",
      `[ironclaw-http] Error: ${message}\n`,
    );
    return {
      exitCode: 1,
      signal: null,
      timedOut: false,
      errorCode: "ironclaw_execution_failed",
      errorMessage: message,
    };
  }
}
