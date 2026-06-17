/**
 * Configuration schema for Paperclip UI form rendering
 * Defines the shape and constraints for adapter configuration fields
 */

export interface ConfigFieldSchema {
  key: string;
  label: string;
  type: "text" | "select" | "toggle" | "number" | "textarea" | "combobox";
  options?: Array<{ value: string; label: string }>;
  default?: unknown;
  hint?: string;
  required?: boolean;
  group?: string;
  meta?: Record<string, unknown>;
}

export interface AdapterConfigSchema {
  fields: ConfigFieldSchema[];
}

export function getConfigSchema(): AdapterConfigSchema {
  return {
    fields: [
      {
        key: "url",
        label: "Ironclaw URL",
        type: "text",
        required: true,
        hint: "HTTP URL of your Ironclaw instance (e.g., http://localhost:8080)",
      },
      {
        key: "authToken",
        label: "API Token",
        type: "text",
        required: true,
        hint: "Bearer token for Ironclaw API authentication",
        meta: { secret: true },
      },
      {
        key: "model",
        label: "Default Model",
        type: "text",
        hint: "LLM model to use (optional, uses Ironclaw default if not specified)",
      },
      {
        key: "timeout",
        label: "Timeout (seconds)",
        type: "number",
        default: 120,
        hint: "Maximum seconds to wait for a response (1-3600)",
        meta: { min: 1, max: 3600 },
      },
      {
        key: "stream",
        label: "Enable Streaming",
        type: "toggle",
        default: false,
        hint: "Enable streaming responses from Ironclaw",
      },
      {
        key: "pollInterval",
        label: "Poll Interval (ms)",
        type: "number",
        default: 1000,
        hint: "Milliseconds between status checks when not streaming (100-10000)",
        meta: { min: 100, max: 10000 },
      },
      {
        key: "tools",
        label: "Enabled Tools",
        type: "text",
        hint: "Comma-separated list of tool names to enable",
      },
      {
        key: "instructions",
        label: "System Instructions",
        type: "textarea",
        hint: "Custom system prompt or instructions for the agent",
      },
    ],
  };
}


