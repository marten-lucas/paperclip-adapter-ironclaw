/**
 * Server adapter factory
 */

import type { ServerAdapterModule } from "@paperclipai/adapter-utils";
import { execute } from "./execute.js";
import { testEnvironment } from "./test.js";
import { getConfigSchema } from "./config-schema.js";
import { type, label, agentConfigurationDoc } from "../index.js";

// Dynamic models list - updated by execute() on first run
let models: Array<{ id: string; label: string }> = [];

export function createServerAdapter(): ServerAdapterModule {
  const adapter: any = {
    type,
    execute,
    testEnvironment,
    models,
    agentConfigurationDoc,
    getConfigSchema, // Always include getConfigSchema
  };

  return adapter;
}

// Export for Paperclip UI
export { getConfigSchema } from "./config-schema.js";

// Export for testing
export { execute } from "./execute.js";
export { testEnvironment } from "./test.js";
export { executeRequest, listModels } from "./client.js";
export type { IroncrawResponse, ToolDefinition } from "./types.js";
