import { randomUUID } from "node:crypto";
import { createSubsystemLogger, type Logger } from "@ku0/agent-runtime-telemetry/logging";
import type {
  NodeCapability,
  NodeDescriptor,
  NodeError,
  NodeMessage,
  NodePermissionStatus,
  NodeResponse,
  NodeStatus,
} from "./protocol";

export interface NodeTransport {
  send: (data: string) => void;
  close: (code?: number, reason?: string) => void;
}

export interface NodeRegistryConfig {
  presenceTimeoutMs?: number;
  offlineRetentionMs?: number;
  requestTimeoutMs?: number;
  logger?: Logger;
  now?: () => number;
  authToken?: string;
}

export interface NodeRegistryStatus {
  total: number;
  online: number;
  offline: number;
  nodes: NodeDescriptor[];
}

interface PendingRequest {
  resolve: (response: NodeResponse) => void;
  timeout: ReturnType<typeof setTimeout>;
}

interface NodeRecord {
  id: string;
  name?: string;
  kind?: string;
  status: NodeStatus;
  capabilities: NodeCapability[];
  permissions?: NodePermissionStatus[];
  connectedAt?: number;
  lastSeenAt?: number;
  disconnectedAt?: number;
  transport?: NodeTransport;
  pending: Map<string, PendingRequest>;
}

interface ConnectionState {
  nodeId?: string;
  transport: NodeTransport;
  registeredAt: number;
  lastSeenAt: number;
}

export class NodeRegistry {
  private readonly nodes = new Map<string, NodeRecord>();
  private readonly presenceTimeoutMs: number;
  private readonly offlineRetentionMs: number;
  private readonly requestTimeoutMs: number;
  private readonly logger: Logger;
  private readonly now: () => number;
  private readonly authToken?: string;

  constructor(config: NodeRegistryConfig = {}) {
    this.presenceTimeoutMs = config.presenceTimeoutMs ?? 15_000;
    this.offlineRetentionMs = config.offlineRetentionMs ?? 60_000;
    this.requestTimeoutMs = config.requestTimeoutMs ?? 20_000;
    this.logger = config.logger ?? createSubsystemLogger("gateway", "nodes");
    this.now = config.now ?? Date.now;
    this.authToken = config.authToken;
  }

  handleConnection(transport: NodeTransport) {
    const state: ConnectionState = {
      transport,
      registeredAt: this.now(),
      lastSeenAt: this.now(),
    };

    return {
      onMessage: (raw: string) => this.handleMessage(state, raw),
      onClose: () => this.handleClose(state),
    };
  }

  listNodes(): NodeDescriptor[] {
    return Array.from(this.nodes.values())
      .map((record) => this.toDescriptor(record))
      .sort((a, b) => (b.lastSeenAt ?? 0) - (a.lastSeenAt ?? 0));
  }

  describeNode(nodeId: string): NodeDescriptor | undefined {
    const record = this.nodes.get(nodeId);
    return record ? this.toDescriptor(record) : undefined;
  }

  getStatus(): NodeRegistryStatus {
    const nodes = this.listNodes();
    const online = nodes.filter((node) => node.status === "online").length;
    return {
      total: nodes.length,
      online,
      offline: nodes.length - online,
      nodes,
    };
  }

  async invokeNode(
    nodeId: string,
    command: string,
    args?: Record<string, unknown>
  ): Promise<NodeResponse> {
    const record = this.nodes.get(nodeId);
    if (!record || record.status !== "online" || !record.transport) {
      return {
        success: false,
        error: {
          code: "NODE_OFFLINE",
          message: `Node ${nodeId} is offline`,
        },
      };
    }

    const requestId = randomUUID();
    const payload: NodeMessage = {
      type: "node.invoke",
      requestId,
      command,
      args,
    };

    try {
      record.transport.send(JSON.stringify(payload));
    } catch (error) {
      return {
        success: false,
        error: {
          code: "SEND_FAILED",
          message: error instanceof Error ? error.message : String(error),
        },
      };
    }

    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        record.pending.delete(requestId);
        resolve({
          success: false,
          error: {
            code: "TIMEOUT",
            message: "Node did not respond in time",
          },
        });
      }, this.requestTimeoutMs);

      record.pending.set(requestId, { resolve, timeout });
    });
  }

  pruneStale(now = this.now()): void {
    for (const record of this.nodes.values()) {
      if (record.status === "online") {
        const lastSeenAt = record.lastSeenAt ?? record.connectedAt ?? now;
        if (now - lastSeenAt > this.presenceTimeoutMs) {
          this.markOffline(record, "Presence timeout");
        }
        continue;
      }

      if (record.disconnectedAt && now - record.disconnectedAt > this.offlineRetentionMs) {
        this.nodes.delete(record.id);
      }
    }
  }

  private handleMessage(state: ConnectionState, raw: string): void {
    let message: NodeMessage;
    try {
      message = JSON.parse(raw) as NodeMessage;
    } catch (error) {
      this.logger.warn("Node sent invalid JSON", { error: String(error) });
      return;
    }

    state.lastSeenAt = this.now();

    if (message.type === "node.hello") {
      if (!this.validateToken(message.token)) {
        this.sendError(state.transport, "UNAUTHORIZED", "Invalid node token");
        state.transport.close(1008, "Unauthorized");
        return;
      }
      state.nodeId = message.nodeId;
      this.registerNode(state, message);
      return;
    }

    if (!state.nodeId) {
      this.sendError(state.transport, "HELLO_REQUIRED", "Node must send hello first");
      state.transport.close(1008, "Missing hello");
      return;
    }

    const record = this.nodes.get(state.nodeId);
    if (!record) {
      this.sendError(state.transport, "NOT_REGISTERED", "Node not registered");
      return;
    }

    record.lastSeenAt = state.lastSeenAt;

    if (message.type === "node.heartbeat") {
      return;
    }

    if (message.type === "node.result") {
      const pending = record.pending.get(message.requestId);
      if (pending) {
        clearTimeout(pending.timeout);
        record.pending.delete(message.requestId);
        pending.resolve({
          success: message.success,
          result: message.result,
          error: message.error,
        });
      }
      return;
    }

    if (message.type === "node.error") {
      this.logger.warn("Node error", {
        nodeId: record.id,
        code: message.code,
        message: message.message,
      });
      return;
    }

    this.sendError(state.transport, "UNSUPPORTED", "Unsupported node message");
  }

  private handleClose(state: ConnectionState): void {
    if (!state.nodeId) {
      return;
    }

    const record = this.nodes.get(state.nodeId);
    if (!record) {
      return;
    }

    this.markOffline(record, "Connection closed");
  }

  private registerNode(
    state: ConnectionState,
    message: Extract<NodeMessage, { type: "node.hello" }>
  ): void {
    const existing = this.nodes.get(message.nodeId);
    if (existing?.transport && existing.transport !== state.transport) {
      existing.transport.close(1000, "Replaced by new connection");
    }

    const now = this.now();
    const record: NodeRecord = existing ?? {
      id: message.nodeId,
      status: "online",
      capabilities: [],
      permissions: [],
      pending: new Map(),
    };

    record.name = message.name ?? record.name;
    record.kind = message.kind ?? record.kind;
    record.capabilities = message.capabilities ?? [];
    record.permissions = message.permissions ?? [];
    record.status = "online";
    record.transport = state.transport;
    record.connectedAt = record.connectedAt ?? now;
    record.lastSeenAt = now;
    record.disconnectedAt = undefined;

    this.nodes.set(message.nodeId, record);
    this.logger.info("Node connected", {
      nodeId: record.id,
      name: record.name,
      kind: record.kind,
    });
  }

  private markOffline(record: NodeRecord, reason: string): void {
    if (record.status === "offline") {
      return;
    }
    record.status = "offline";
    record.transport = undefined;
    record.disconnectedAt = this.now();
    this.rejectPending(record, {
      code: "NODE_DISCONNECTED",
      message: reason,
    });
    this.logger.info("Node disconnected", { nodeId: record.id, reason });
  }

  private rejectPending(record: NodeRecord, error: NodeError): void {
    for (const pending of record.pending.values()) {
      clearTimeout(pending.timeout);
      pending.resolve({ success: false, error });
    }
    record.pending.clear();
  }

  private validateToken(token?: string): boolean {
    if (!this.authToken) {
      return true;
    }
    return token === this.authToken;
  }

  private sendError(transport: NodeTransport, code: string, message: string): void {
    const payload: NodeMessage = {
      type: "node.error",
      code,
      message,
    };
    try {
      transport.send(JSON.stringify(payload));
    } catch (error) {
      this.logger.warn("Failed to send node error", { error: String(error) });
    }
  }

  private toDescriptor(record: NodeRecord): NodeDescriptor {
    return {
      id: record.id,
      name: record.name,
      kind: record.kind,
      status: record.status,
      capabilities: record.capabilities,
      permissions: record.permissions,
      connectedAt: record.connectedAt,
      lastSeenAt: record.lastSeenAt,
    };
  }
}
