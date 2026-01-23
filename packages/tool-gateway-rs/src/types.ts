import type { MCPTool, MCPToolCall, MCPToolResult } from "@ku0/agent-runtime-core";

export type McpManifest = {
  serverId: string;
  name: string;
  version: string;
  description?: string;
  tools: MCPTool[];
};

export type McpTransportConfig =
  | {
      type: "stdio";
      command: string;
      args?: string[];
      env?: Record<string, string>;
      cwd?: string;
    }
  | {
      type: "sse";
      url: string;
    }
  | {
      type: "streamableHttp";
      url: string;
    }
  | {
      type: "http";
      url: string;
    }
  | {
      type: "websocket";
      url: string;
    };

export type McpServerConfig = {
  serverId: string;
  transport: McpTransportConfig;
  manifest: McpManifest;
};

export type ToolRegistryEntry = {
  toolId: string;
  serverId: string;
  tool: MCPTool;
};

export type CapabilityGrant = {
  grantId?: string;
  capability: string;
  issuedAt: number;
  expiresAt?: number;
  scope?: string;
  approvalId?: string;
};

export type ToolInvocation = {
  toolId: string;
  requestId?: string;
  arguments: MCPToolCall["arguments"];
  grantIds: string[];
  redactKeys?: string[];
  timeoutMs?: number;
  maxOutputBytes?: number;
  maxOutputLines?: number;
};

export type ToolAuditEvent = {
  sequence: number;
  toolId: string;
  requestId?: string;
  grantIds: string[];
  inputHash: string;
  outputHash: string;
  success: boolean;
  durationMs: number;
  createdAt: number;
};

export type ToolGatewaySnapshot = {
  tools: ToolRegistryEntry[];
  grants: CapabilityGrant[];
  auditCursor: number;
};

export type ToolGateway = {
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
  ToolGateway: new () => ToolGateway;
};

export type { MCPTool, MCPToolCall, MCPToolResult };
