/**
 * Builds the final adapter config from CreateConfigValues form data
 */

export interface CreateConfigValuesCompat {
  adapterSchemaValues?: Record<string, unknown>;
  [key: string]: unknown;
}

function parseCommaSeparatedArray(value: string): string[] {
  return value
    .split(",")
    .map((item: string) => item.trim())
    .filter((item: string) => Boolean(item));
}

export function buildIronclawConfig(v: CreateConfigValuesCompat): Record<string, unknown> {
  // Support both new adapterSchemaValues and fallback to other properties
  const schemaValues: Record<string, unknown> = (v?.adapterSchemaValues ?? v ?? {}) as Record<
    string,
    unknown
  >;
  const ac: Record<string, unknown> = {};

  // Required fields
  if (schemaValues.url) {
    ac.url = String(schemaValues.url).trim();
  }
  if (schemaValues.authToken) {
    ac.authToken = String(schemaValues.authToken);
  }

  // Optional fields
  if (schemaValues.model) {
    ac.model = String(schemaValues.model).trim();
  }

  // Numeric fields with defaults
  if (typeof schemaValues.timeout === "number") {
    ac.timeout = Math.max(1, Math.min(3600, schemaValues.timeout));
  } else if (schemaValues.timeout !== undefined && schemaValues.timeout !== null) {
    const parsed = parseInt(String(schemaValues.timeout), 10);
    if (!isNaN(parsed)) {
      ac.timeout = Math.max(1, Math.min(3600, parsed));
    }
  }

  if (typeof schemaValues.pollInterval === "number") {
    ac.pollInterval = Math.max(100, Math.min(10000, schemaValues.pollInterval));
  } else if (schemaValues.pollInterval !== undefined && schemaValues.pollInterval !== null) {
    const parsed = parseInt(String(schemaValues.pollInterval), 10);
    if (!isNaN(parsed)) {
      ac.pollInterval = Math.max(100, Math.min(10000, parsed));
    }
  }

  // Boolean field
  if (typeof schemaValues.stream === "boolean") {
    ac.stream = schemaValues.stream;
  } else if (schemaValues.stream !== undefined && schemaValues.stream !== null) {
    ac.stream = String(schemaValues.stream).toLowerCase() === "true";
  }

  // Array field (tools as comma-separated string or array)
  if (schemaValues.tools) {
    if (Array.isArray(schemaValues.tools)) {
      ac.tools = schemaValues.tools.filter((t: unknown) => typeof t === "string" && String(t).trim());
    } else if (typeof schemaValues.tools === "string") {
      ac.tools = parseCommaSeparatedArray(schemaValues.tools);
    }
  }

  // Instructions field
  if (schemaValues.instructions && typeof schemaValues.instructions === "string") {
    const trimmed = schemaValues.instructions.trim();
    if (trimmed) {
      ac.instructions = trimmed;
    }
  }

  return ac;
}

// Compatibility alias for loaders that derive function names from adapter type (ironclaw_http).
export const buildIronclawHttpConfig = buildIronclawConfig;


