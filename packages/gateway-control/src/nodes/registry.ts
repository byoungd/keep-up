import { randomUUID } from "node:crypto";
import { createSubsystemLogger, type Logger } from "@ku0/agent-runtime-telemetry/logging";
import type {
  GatewayNodeConnection,
  GatewayNodeInboundMessage,
  GatewayNodeOutboundMessage,
  NodeDescriptor,
  NodeInvoke,
  NodeResponse,
} from "./types";

interface NodeRegistryEntry {
  node: NodeDescriptor;
  connection?: GatewayNodeConnection;
  lastSeen: number;
}

interface PendingInvoke {
  nodeId: string;
  resolve: (response: NodeResponse) => void;
  reject: (error: Error) => void;
  timeoutId: NodeJS.Timeout;
}

export interface NodeRegistryConfig {
  logger?: Logger;
  presenceTimeoutMs?: number;
  invokeTimeoutMs?: number;
  sweepIntervalMs?: number;
  now?: () => number;
}

export class NodeRegistry {
  private readonly logger: Logger;
  private readonly presenceTimeoutMs: number;
  private readonly invokeTimeoutMs: number;
  private readonly now: () => number;
  private readonly entries = new Map<string, NodeRegistryEntry>();
  private readonly pending = new Map<string, PendingInvoke>();
  private sweepTimer?: NodeJS.Timeout;

  constructor(config?: NodeRegistryConfig) {
    this.logger = config?.logger ?? createSubsystemLogger("gateway", "nodes");
    this.presenceTimeoutMs = config?.presenceTimeoutMs ?? 30_000;
    this.invokeTimeoutMs = config?.invokeTimeoutMs ?? 15_000;
    this.now = config?.now ?? Date.now;

    if (config?.sweepIntervalMs && config.sweepIntervalMs > 0) {
      this.sweepTimer = setInterval(() => this.sweepStale(), config.sweepIntervalMs);
      if (this.sweepTimer.unref) {
        this.sweepTimer.unref();
      }
    }
  }

  stop(): void {
    if (this.sweepTimer) {
      clearInterval(this.sweepTimer);
      this.sweepTimer = undefined;
    }
  }

  register(node: NodeDescriptor, connection?: GatewayNodeConnection): void {
    const existing = this.entries.get(node.nodeId);
    const entry: NodeRegistryEntry = {
      node,
      connection: connection ?? existing?.connection,
      lastSeen: this.now(),
    };
    this.entries.set(node.nodeId, entry);
  }

  update(nodeId: string, update: Partial<NodeDescriptor>): boolean {
    const entry = this.entries.get(nodeId);
    if (!entry) {
      return false;
    }
    entry.node = { ...entry.node, ...update, nodeId: entry.node.nodeId };
    entry.lastSeen = this.now();
    return true;
  }

  attachConnection(nodeId: string, connection: GatewayNodeConnection): boolean {
    const entry = this.entries.get(nodeId);
    if (!entry) {
      return false;
    }
    entry.connection = connection;
    entry.lastSeen = this.now();
    return true;
  }

  touch(nodeId: string): boolean {
    const entry = this.entries.get(nodeId);
    if (!entry) {
      return false;
    }
    entry.lastSeen = this.now();
    return true;
  }

  list(): NodeDescriptor[] {
    this.sweepStale();
    return Array.from(this.entries.values()).map((entry) => entry.node);
  }

  describe(nodeId: string): NodeDescriptor | undefined {
    this.sweepStale();
    return this.entries.get(nodeId)?.node;
  }

  remove(nodeId: string, reason?: string): boolean {
    const entry = this.entries.get(nodeId);
    if (!entry) {
      return false;
    }
    this.entries.delete(nodeId);
    if (entry.connection?.close) {
      entry.connection.close(4000, reason ?? "Node disconnected");
    }
    this.rejectPendingForNode(nodeId, reason ?? "Node disconnected");
    return true;
  }

  sweepStale(): string[] {
    const now = this.now();
    const stale: string[] = [];
    for (const [nodeId, entry] of this.entries.entries()) {
      if (now - entry.lastSeen > this.presenceTimeoutMs) {
        stale.push(nodeId);
      }
    }
    for (const nodeId of stale) {
      this.remove(nodeId, "Presence timeout");
    }
    return stale;
  }

  async invoke(request: NodeInvoke, options?: { timeoutMs?: number }): Promise<NodeResponse> {
    const entry = this.entries.get(request.nodeId);
    if (!entry?.connection) {
      throw new Error(`Node not connected: ${request.nodeId}`);
    }

    const requestId = this.ensureRequestId(request.requestId);
    const message: GatewayNodeOutboundMessage = {
      type: "invoke",
      requestId,
      command: request.command,
      args: request.args,
    };

    return new Promise<NodeResponse>((resolve, reject) => {
      const timeoutMs = options?.timeoutMs ?? this.invokeTimeoutMs;
      const timeoutId = setTimeout(() => {
        this.pending.delete(requestId);
        reject(new Error(`Node invoke timeout: ${request.nodeId}`));
      }, timeoutMs);

      this.pending.set(requestId, {
        nodeId: request.nodeId,
        resolve,
        reject,
        timeoutId,
      });

      try {
        entry.connection?.send(message);
      } catch (error) {
        clearTimeout(timeoutId);
        this.pending.delete(requestId);
        reject(new Error(`Failed to send invoke to node ${request.nodeId}: ${String(error)}`));
      }
    });
  }

  handleMessage(
    message: GatewayNodeInboundMessage,
    connection?: GatewayNodeConnection
  ): GatewayNodeOutboundMessage | null {
    switch (message.type) {
      case "hello":
        this.register(message.node, connection);
        return {
          type: "welcome",
          nodeId: message.node.nodeId,
          serverTime: this.now(),
        };
      case "describe":
        this.register(message.node, connection);
        return null;
      case "heartbeat":
        this.touch(message.nodeId);
        return null;
      case "response":
        this.handleResponse(message.response);
        return null;
      case "ping":
        return {
          type: "pong",
          nonce: message.nonce,
          serverTime: this.now(),
        };
      default:
        // biome-ignore lint/suspicious/noExplicitAny: runtime type check for unknown messages
        this.logger.warn("Unhandled node message", { messageType: (message as any).type });
        return null;
    }
  }

  handleResponse(response: NodeResponse): void {
    const pending = this.pending.get(response.requestId);
    if (!pending) {
      this.logger.warn("Node response without pending request", {
        requestId: response.requestId,
        nodeId: response.nodeId,
      });
      return;
    }

    clearTimeout(pending.timeoutId);
    this.pending.delete(response.requestId);
    pending.resolve(response);
  }

  private ensureRequestId(requestId?: string): string {
    let id = requestId ?? randomUUID();
    while (this.pending.has(id)) {
      id = randomUUID();
    }
    return id;
  }

  private rejectPendingForNode(nodeId: string, reason: string): void {
    for (const [requestId, pending] of this.pending.entries()) {
      if (pending.nodeId !== nodeId) {
        continue;
      }
      clearTimeout(pending.timeoutId);
      pending.reject(new Error(`Node ${nodeId} disconnected: ${reason}`));
      this.pending.delete(requestId);
    }
  }
}
