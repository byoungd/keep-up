import type {
  CapabilityGrant,
  MCPToolResult,
  McpManifest,
  McpServerConfig,
  McpTransport,
  ToolAuditEvent,
  ToolGatewaySnapshot,
  ToolInvocation,
  ToolRegistryEntry,
} from "@ku0/agent-runtime-core";

export type {
  CapabilityGrant,
  McpManifest,
  McpServerConfig,
  McpTransport,
  ToolAuditEvent,
  ToolGatewaySnapshot,
  ToolInvocation,
  ToolRegistryEntry,
};

export type ToolGatewayBinding = {
  registerManifest: (manifest: McpManifest) => void;
  registerServer: (config: McpServerConfig) => void;
  listTools: () => ToolRegistryEntry[];
  callTool: (invocation: ToolInvocation) => Promise<MCPToolResult>;
  grantCapability: (grant: CapabilityGrant) => string;
  revokeCapability: (grantId: string) => void;
  drainAuditEvents: (after?: number, limit?: number) => ToolAuditEvent[];
  getSnapshot: () => ToolGatewaySnapshot;
  reset: () => void;
};

export type NativeToolGatewayBinding = {
  ToolGateway: new () => ToolGatewayBinding;
};
