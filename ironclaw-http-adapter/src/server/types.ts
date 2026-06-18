/**
 * Type definitions for Ironclaw Responses API
 */

export interface IroncrawResponse {
  id: string; // response_id (thread UUID)
  model: string;
  status: "completed" | "requires_approval" | "tool_call_pending";
  output: ResponseOutput[];
  usage: {
    input_tokens: number;
    output_tokens: number;
    total_tokens: number;
  };
  error?: {
    code: string;
    message: string;
  };
  pending_tool_call?: {
    call_id: string;
    name: string;
    arguments: Record<string, unknown>;
  };
}

export interface ResponseOutput {
  type: "message" | "function_call" | "function_result";
  role?: "user" | "assistant";
  content?: string | ToolCall;
  call_id?: string;
  output?: string;
}

export interface ToolCall {
  call_id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface ToolDefinition {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: {
      type: "object";
      properties: Record<string, unknown>;
      required?: string[];
    };
  };
}

export interface IroncrawAdapterConfig {
  url: string; // Ironclaw instance URL
  authToken: string; // Bearer token
  model?: string; // Optional model override
  timeout?: number; // Request timeout in seconds
  pollInterval?: number; // SSE polling interval (ms)
  stream?: boolean; // Enable streaming (SSE)
  tools?: string[]; // Explicit tool list
  instructions?: string; // System message template
}

export interface RequestPayload {
  input: string | Array<{ type: string; role?: string; content?: string; call_id?: string; output?: string }>;
  model?: string;
  instructions?: string;
  tools?: ToolDefinition[];
  previous_response_id?: string;
  stream?: boolean;
}

export interface ListModelsResponse {
  models?: string[] | Record<string, unknown>;
}
