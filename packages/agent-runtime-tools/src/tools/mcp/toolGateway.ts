import type {
  CapabilityGrant,
  McpManifest,
  McpServerConfig,
  ToolAuditEvent,
  ToolEvent,
  ToolGatewaySnapshot,
  ToolInvocation,
  ToolRegistryEntry,
} from "@ku0/agent-runtime-core";
import type { PersistenceStore } from "@ku0/agent-runtime-persistence";
import {
  getNativeToolGateway,
  getNativeToolGatewayError,
  type NativeToolGatewayBinding,
  type ToolGatewayBinding,
} from "@ku0/tool-gateway-rs/node";

let cachedBinding: NativeToolGatewayBinding | null | undefined;

function resolveBinding(): NativeToolGatewayBinding {
  if (cachedBinding !== undefined) {
    if (!cachedBinding) {
      throw new Error("Tool gateway native binding unavailable.");
    }
    return cachedBinding;
  }

  const binding = getNativeToolGateway();
  if (!binding) {
    const error = getNativeToolGatewayError();
    cachedBinding = null;
    const detail = error ? ` ${error.message}` : "";
    throw new Error(`Tool gateway native binding unavailable.${detail}`);
  }

  cachedBinding = binding;
  return binding;
}

export interface ToolGatewayOptions {
  persistenceStore?: PersistenceStore;
  auditDrainLimit?: number;
  onAuditEvents?: (events: ToolAuditEvent[]) => void;
}

export class ToolGateway {
  private readonly native: ToolGatewayBinding;
  private readonly persistenceStore?: PersistenceStore;
  private readonly auditDrainLimit?: number;
  private readonly onAuditEvents?: (events: ToolAuditEvent[]) => void;
  private lastAuditSequence = 0;
  private readonly runIdByRequest = new Map<string, string>();

  constructor(options: ToolGatewayOptions = {}) {
    const binding = resolveBinding();
    this.native = new binding.ToolGateway();
    this.persistenceStore = options.persistenceStore;
    this.auditDrainLimit = options.auditDrainLimit;
    this.onAuditEvents = options.onAuditEvents;
  }

  registerManifest(manifest: McpManifest): void {
    this.native.registerManifest(manifest);
  }

  registerServer(config: McpServerConfig): void {
    this.native.registerServer(config);
  }

  listTools(): ToolRegistryEntry[] {
    return this.native.listTools();
  }

  async callTool(invocation: ToolInvocation) {
    if ((this.persistenceStore || this.onAuditEvents) && invocation.runId) {
      this.runIdByRequest.set(invocation.requestId, invocation.runId);
    }
    try {
      return await this.native.callTool(invocation);
    } finally {
      this.flushAuditEvents();
    }
  }

  grantCapability(grant: CapabilityGrant): string {
    return this.native.grantCapability(grant);
  }

  revokeCapability(grantId: string): void {
    this.native.revokeCapability(grantId);
  }

  drainAuditEvents(after?: number, limit?: number): ToolAuditEvent[] {
    return this.native.drainAuditEvents(after, limit);
  }

  getSnapshot(): ToolGatewaySnapshot {
    return this.native.getSnapshot();
  }

  reset(): void {
    this.lastAuditSequence = 0;
    this.runIdByRequest.clear();
    this.native.reset();
  }

  private flushAuditEvents(): void {
    if (!this.persistenceStore && !this.onAuditEvents) {
      return;
    }

    const events = this.native.drainAuditEvents(this.lastAuditSequence, this.auditDrainLimit);
    if (!events.length) {
      return;
    }

    this.lastAuditSequence = events.reduce(
      (cursor, event) => Math.max(cursor, event.sequence),
      this.lastAuditSequence
    );

    if (this.onAuditEvents) {
      this.onAuditEvents(events);
    }

    if (!this.persistenceStore) {
      return;
    }

    for (const event of events) {
      try {
        this.persistenceStore.saveToolEvent(this.toToolEvent(event));
      } catch {
        // Fail-open: tool audit persistence should not block runtime execution.
      }
    }
  }

  private toToolEvent(event: ToolAuditEvent): ToolEvent {
    const runId = this.runIdByRequest.get(event.requestId) ?? event.requestId;
    this.runIdByRequest.delete(event.requestId);

    return {
      eventId: `${event.requestId}:${event.sequence}`,
      runId,
      toolId: event.toolId,
      inputHash: event.inputHash,
      outputHash: event.outputHash,
      durationMs: event.durationMs,
      createdAt: event.createdAt,
    };
  }
}

export type { ToolInvocation } from "@ku0/agent-runtime-core";
