import { createSubsystemLogger, type Logger } from "@ku0/agent-runtime-telemetry/logging";

export interface GatewayWebSocketLike {
  send: (data: string) => void;
  close: (code?: number, reason?: string) => void;
}

export interface GatewayClient {
  id: string;
  authenticated: boolean;
  subscriptions: Set<string>;
  connectedAt: number;
  userAgent?: string;
  lastMessageAt?: number;
}

export interface GatewayClientState {
  client: GatewayClient;
  socket: GatewayWebSocketLike;
}

export interface GatewayClientRegistryConfig {
  logger?: Logger;
  maxSubscriptions?: number;
}

export interface SubscriptionResult {
  added: string[];
  rejected: string[];
}

export class GatewayClientRegistry {
  private readonly clients = new Map<string, GatewayClientState>();
  private readonly logger: Logger;
  private readonly maxSubscriptions: number;

  constructor(config?: GatewayClientRegistryConfig) {
    this.logger = config?.logger ?? createSubsystemLogger("gateway", "clients");
    this.maxSubscriptions = config?.maxSubscriptions ?? 50;
  }

  registerClient(
    socket: GatewayWebSocketLike,
    options: { clientId: string; userAgent?: string; authenticated?: boolean }
  ): GatewayClient {
    const client: GatewayClient = {
      id: options.clientId,
      authenticated: options.authenticated ?? false,
      subscriptions: new Set<string>(),
      connectedAt: Date.now(),
      userAgent: options.userAgent,
    };

    this.clients.set(client.id, { client, socket });
    return client;
  }

  removeClient(clientId: string): void {
    this.clients.delete(clientId);
  }

  getClient(clientId: string): GatewayClient | undefined {
    return this.clients.get(clientId)?.client;
  }

  getState(clientId: string): GatewayClientState | undefined {
    return this.clients.get(clientId);
  }

  listClients(): GatewayClient[] {
    return Array.from(this.clients.values(), (state) => state.client);
  }

  markAuthenticated(clientId: string): void {
    const state = this.clients.get(clientId);
    if (!state) {
      return;
    }
    state.client.authenticated = true;
  }

  updateLastMessage(clientId: string, timestamp: number): void {
    const state = this.clients.get(clientId);
    if (!state) {
      return;
    }
    state.client.lastMessageAt = timestamp;
  }

  addSubscriptions(clientId: string, patterns: string[]): SubscriptionResult {
    const state = this.clients.get(clientId);
    if (!state) {
      return { added: [], rejected: patterns };
    }

    const normalized = normalizePatterns(patterns);
    if (normalized.length === 0) {
      return { added: [], rejected: [] };
    }

    const remaining = this.maxSubscriptions - state.client.subscriptions.size;
    if (remaining <= 0) {
      return { added: [], rejected: normalized };
    }

    const added: string[] = [];
    const rejected: string[] = [];

    for (const pattern of normalized) {
      if (state.client.subscriptions.has(pattern)) {
        continue;
      }
      if (added.length >= remaining) {
        rejected.push(pattern);
        continue;
      }
      state.client.subscriptions.add(pattern);
      added.push(pattern);
    }

    return { added, rejected };
  }

  removeSubscriptions(clientId: string, patterns: string[]): string[] {
    const state = this.clients.get(clientId);
    if (!state) {
      return [];
    }
    const removed: string[] = [];
    for (const pattern of normalizePatterns(patterns)) {
      if (state.client.subscriptions.delete(pattern)) {
        removed.push(pattern);
      }
    }
    return removed;
  }

  listSubscribers(event: string): GatewayClientState[] {
    const results: GatewayClientState[] = [];
    for (const state of this.clients.values()) {
      if (matchesSubscriptions(state.client.subscriptions, event)) {
        results.push(state);
      }
    }
    return results;
  }

  sendToClient(clientId: string, payload: string): void {
    const state = this.clients.get(clientId);
    if (!state) {
      return;
    }
    try {
      state.socket.send(payload);
    } catch (error) {
      this.logger.warn("Failed to send gateway message", { error: String(error) });
    }
  }
}

function normalizePatterns(patterns: string[]): string[] {
  return patterns.map((pattern) => pattern.trim()).filter(Boolean);
}

export function matchesSubscriptions(subscriptions: Set<string>, event: string): boolean {
  for (const pattern of subscriptions) {
    if (matchPattern(pattern, event)) {
      return true;
    }
  }
  return false;
}

export function matchPattern(pattern: string, value: string): boolean {
  if (pattern === "*") {
    return true;
  }
  if (pattern === value) {
    return true;
  }
  const regex = new RegExp(`^${escapePattern(pattern).replace(/\*/g, ".*")}$`);
  return regex.test(value);
}

function escapePattern(pattern: string): string {
  return pattern.replace(/[|\\{}()[\]^$+?.]/g, "\\$&");
}
