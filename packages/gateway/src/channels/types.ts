import type { Logger } from "@ku0/agent-runtime-telemetry/logging";

export type ChannelDmPolicy = "allow" | "deny" | "pairing";
export type ChannelAllowFrom = "any" | string[];
export type ChannelIsolationLevel = "main" | "sandbox";

export interface SessionKey {
  sessionId: string;
  agentId?: string;
  channelId?: string;
  isolationLevel?: ChannelIsolationLevel;
}

export interface ChannelConfig {
  allowFrom?: ChannelAllowFrom;
  dmPolicy?: ChannelDmPolicy;
  groups?: string[];
  sessionKey?: SessionKey;
  pairingCodeTtlMs?: number;
}

export interface ChannelMessage {
  channelId: string;
  conversationId: string;
  peerId?: string;
  text: string;
  timestamp: number;
  raw?: unknown;
}

export interface ChannelTarget {
  channelId: string;
  conversationId: string;
}

export interface RoutingContext {
  channelId: string;
  sessionKey: SessionKey;
  peerId?: string;
}

export interface ChannelPluginContext {
  emit: (message: ChannelMessage) => void;
  logger: Logger;
}

export type ChannelGatewayMethodHandler = (
  params: unknown,
  context: RoutingContext
) => Promise<unknown> | unknown;

export interface ChannelGatewayMethod {
  description?: string;
  handler: ChannelGatewayMethodHandler;
  requiresAuth?: boolean;
}

export interface ChannelPlugin {
  id: string;
  name: string;
  config?: ChannelConfig;
  gatewayMethods?: Record<string, ChannelGatewayMethod>;
  start?: (context: ChannelPluginContext) => Promise<void>;
  stop?: () => Promise<void>;
  sendMessage?: (target: ChannelTarget, text: string) => Promise<void>;
  healthCheck?: () => Promise<ChannelHealth>;
}

export interface ChannelHealth {
  ok: boolean;
  latencyMs?: number;
  details?: Record<string, unknown>;
}

export interface ChannelStatus {
  id: string;
  name: string;
  running: boolean;
  config: ChannelConfig;
  gatewayMethods: string[];
  health?: ChannelHealth;
  lastHealthCheckAt?: number;
  lastError?: string;
}

export interface ChannelRegistryStatus {
  total: number;
  running: number;
  healthy: number;
  channels: ChannelStatus[];
}
