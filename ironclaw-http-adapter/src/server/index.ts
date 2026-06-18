/**
 * Server adapter factory
 */

import type { ServerAdapterModule } from "@paperclipai/adapter-utils";
import { execute } from "./execute.js";
import { testEnvironment } from "./test.js";
import { getConfigSchema } from "./config-schema.js";
import { type, label, agentConfigurationDoc } from "../index.js";
import { adapterModels } from "./models-cache.js";

export function createServerAdapter(): ServerAdapterModule {
  const adapter: any = {
    type,
    label,
    execute,
    testEnvironment,
    models: adapterModels,
    config: getConfigSchema(),
    agentConfigurationDoc,
    getConfigSchema,
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
