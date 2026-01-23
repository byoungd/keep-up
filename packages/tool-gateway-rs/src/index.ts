import type { NativeToolGatewayBinding } from "./types";

export type {
  CapabilityGrant,
  MCPTool,
  MCPToolCall,
  MCPToolResult,
  McpManifest,
  McpServerConfig,
  McpTransportConfig,
  NativeToolGatewayBinding,
  ToolAuditEvent,
  ToolGateway,
  ToolGatewaySnapshot,
  ToolInvocation,
  ToolRegistryEntry,
} from "./types";

const browserError = new Error("Tool gateway native bindings are not available in browser.");

export function getNativeToolGateway(): NativeToolGatewayBinding | null {
  return null;
}

export function getNativeToolGatewayError(): Error | null {
  return browserError;
}
