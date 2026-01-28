import type { Logger } from "@ku0/agent-runtime-telemetry/logging";

export interface ChannelMessage {
  channel: string;
  conversationId: string;
  senderId?: string;
  text: string;
  timestamp: number;
  raw?: unknown;
}

export interface ChannelTarget {
  channel: string;
  conversationId: string;
}

export interface ChannelAdapterContext {
  emit: (message: ChannelMessage) => void;
  logger: Logger;
}

export interface ChannelAdapter {
  id: string;
  channel: string;
  start(context: ChannelAdapterContext): Promise<void>;
  stop(): Promise<void>;
  sendMessage(target: ChannelTarget, text: string): Promise<void>;
  healthCheck?: () => Promise<ChannelHealth>;
}

export type ChannelMessageHandler = (message: ChannelMessage) => void;

export type ChannelDmPolicy = "allow" | "deny" | "pairing";

export type ChannelAllowFrom = "any" | string[];

export interface ChannelConfig {
  allowFrom?: ChannelAllowFrom;
  dmPolicy?: ChannelDmPolicy;
  groups?: string[];
  sessionId?: string;
  pairingCodeTtlMs?: number;
}

export interface ChannelGatewayMethod {
  description?: string;
}

export interface ChannelPlugin {
  id: string;
  name: string;
  adapter: ChannelAdapter;
  config?: ChannelConfig;
  gatewayMethods?: Record<string, ChannelGatewayMethod>;
}

export interface ChannelHealth {
  ok: boolean;
  latencyMs?: number;
  details?: Record<string, unknown>;
}

export interface ChannelStatus {
  id: string;
  channel: string;
  name?: string;
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
