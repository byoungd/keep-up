import { randomUUID } from "node:crypto";

import type { CapabilityGrant, McpServerConfig } from "@ku0/agent-runtime-core";

export interface ToolGatewayConfigSnapshot {
  servers: McpServerConfig[];
  grants: CapabilityGrant[];
}

export class ToolGatewayConfigStore {
  private readonly servers = new Map<string, McpServerConfig>();
  private readonly grants = new Map<string, CapabilityGrant>();

  registerServer(config: McpServerConfig): void {
    if (this.servers.has(config.serverId)) {
      throw new Error(`MCP server already registered: ${config.serverId}`);
    }
    this.servers.set(config.serverId, config);
  }

  listServers(): McpServerConfig[] {
    return Array.from(this.servers.values()).sort((a, b) => a.serverId.localeCompare(b.serverId));
  }

  grantCapability(grant: CapabilityGrant): string {
    const grantId = grant.grantId ?? randomUUID();
    const issuedAt = grant.issuedAt ?? Date.now();
    const normalized: CapabilityGrant = {
      ...grant,
      grantId,
      issuedAt,
    };
    this.grants.set(grantId, normalized);
    return grantId;
  }

  revokeCapability(grantId: string): void {
    this.grants.delete(grantId);
  }

  listGrants(): CapabilityGrant[] {
    return Array.from(this.grants.values()).sort((a, b) =>
      (a.grantId ?? "").localeCompare(b.grantId ?? "")
    );
  }

  getSnapshot(): ToolGatewayConfigSnapshot {
    return {
      servers: this.listServers(),
      grants: this.listGrants(),
    };
  }

  reset(): void {
    this.servers.clear();
    this.grants.clear();
  }
}
