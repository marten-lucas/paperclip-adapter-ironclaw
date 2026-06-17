/**
 * Server adapter factory
 */

import type { ServerAdapterModule } from "@paperclipai/adapter-utils";
import { execute } from "./execute.js";
import { testEnvironment } from "./test.js";
import { type, label, agentConfigurationDoc, configSchema } from "../index.js";

// Dynamic models list - updated by execute() on first run
let models: Array<{ id: string; label: string }> = [];

export function createServerAdapter(): ServerAdapterModule {
  return {
    type,
    execute,
    testEnvironment,
    models,
    agentConfigurationDoc,
  };
}

// Export configSchema separately for Paperclip UI
export { configSchema };

// Export for testing
export { execute } from "./execute.js";
export { testEnvironment } from "./test.js";
export { executeRequest, listModels } from "./client.js";
export type { IroncrawResponse, ToolDefinition } from "./types.js";
