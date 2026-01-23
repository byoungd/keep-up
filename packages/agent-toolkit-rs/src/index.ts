import type { NativeAgentToolkitBinding } from "./types";

export type {
  AgentToolkitArtifact,
  AgentToolkitRegistryBinding,
  NativeAgentToolkitBinding,
  ToolkitToolDefinition,
  ToolkitToolError,
  ToolkitToolResult,
} from "./types";

const browserError = new Error("Agent toolkit native bindings are not available in browser.");

export function getNativeAgentToolkit(): NativeAgentToolkitBinding | null {
  return null;
}

export function getNativeAgentToolkitError(): Error | null {
  return browserError;
}
