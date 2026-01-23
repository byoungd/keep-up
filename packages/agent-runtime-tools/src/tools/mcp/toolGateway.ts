import type { MCPToolResult } from "@ku0/agent-runtime-core";
import {
  type CapabilityGrant,
  getNativeToolGateway,
  type McpManifest,
  type McpServerConfig,
  type ToolAuditEvent,
  type ToolGateway,
  type ToolGatewaySnapshot,
  type ToolInvocation,
  type ToolRegistryEntry,
} from "@ku0/tool-gateway-rs/node";

export type {
  CapabilityGrant,
  McpManifest,
  McpServerConfig,
  ToolAuditEvent,
  ToolGateway,
  ToolGatewaySnapshot,
  ToolInvocation,
  ToolRegistryEntry,
};

export class ToolGatewayAdapter {
  constructor(private readonly gateway: ToolGateway) {}

  registerManifest(manifest: McpManifest): void {
    this.gateway.registerManifest(manifest);
  }

  registerServer(config: McpServerConfig): void {
    this.gateway.registerServer(config);
  }

  listTools(): ToolRegistryEntry[] {
    return this.gateway.listTools();
  }

  async callTool(invocation: ToolInvocation): Promise<MCPToolResult> {
    return this.gateway.callTool(invocation);
  }

  grantCapability(grant: CapabilityGrant): string {
    return this.gateway.grantCapability(grant);
  }

  revokeCapability(grantId: string): void {
    this.gateway.revokeCapability(grantId);
  }

  drainAuditEvents(after?: number, limit?: number): ToolAuditEvent[] {
    return this.gateway.drainAuditEvents(after, limit);
  }

  getSnapshot(): ToolGatewaySnapshot {
    return this.gateway.getSnapshot();
  }

  reset(): void {
    this.gateway.reset();
  }
}

export function createToolGatewayAdapter(): ToolGatewayAdapter | null {
  const binding = getNativeToolGateway();
  if (!binding) {
    return null;
  }
  return new ToolGatewayAdapter(new binding.ToolGateway());
}
