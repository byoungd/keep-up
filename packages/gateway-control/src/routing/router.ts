import { createSubsystemLogger, type Logger } from "@ku0/agent-runtime-telemetry/logging";
import type { ChannelRegistry } from "../channels/registry";
import type { ChannelConfig, ChannelMessage, ChannelTarget } from "../channels/types";

export interface ChannelRouterConfig {
  registry: ChannelRegistry;
  logger?: Logger;
  defaultSessionId?: string;
  defaultPolicy?: ChannelConfig;
  pairing?: {
    ttlMs?: number;
    generateCode?: () => string;
  };
}

export type ChannelRouteHandler = (
  sessionId: string,
  message: ChannelMessage
) => Promise<void> | void;

export type ChannelRouteStatus = "routed" | "blocked" | "paired";

export interface ChannelRouteResult {
  status: ChannelRouteStatus;
  sessionId?: string;
  reason?: string;
}

interface PairingState {
  code: string;
  expiresAt: number;
}

export class ChannelRouter {
  private readonly registry: ChannelRegistry;
  private readonly logger: Logger;
  private readonly defaultSessionId?: string;
  private readonly defaultPolicy: ChannelConfig;
  private readonly pairingTtlMs: number;
  private readonly generatePairingCode: () => string;
  private readonly pendingPairings = new Map<string, PairingState>();
  private readonly pairedSenders = new Map<string, Set<string>>();

  constructor(config: ChannelRouterConfig) {
    this.registry = config.registry;
    this.logger = config.logger ?? createSubsystemLogger("gateway", "routing");
    this.defaultSessionId = config.defaultSessionId;
    this.defaultPolicy = normalizePolicy(config.defaultPolicy);
    this.pairingTtlMs = config.pairing?.ttlMs ?? 10 * 60 * 1000;
    this.generatePairingCode = config.pairing?.generateCode ?? generatePairingCode;
  }

  async handleMessage(
    message: ChannelMessage,
    route: ChannelRouteHandler
  ): Promise<ChannelRouteResult> {
    const policy = normalizePolicy({
      ...this.defaultPolicy,
      ...(this.registry.getChannelConfig(message.channel) ?? {}),
    });

    if (policy.groups?.includes(message.conversationId)) {
      return this.routeMessage(message, policy, route);
    }

    const senderId = message.senderId ?? "unknown";
    const allowFrom = policy.allowFrom ?? "any";
    const isPairingMode = policy.dmPolicy === "pairing";
    const allowFromAnyIsUnknown = isPairingMode && allowFrom === "any";
    const senderAllowed = allowFromAnyIsUnknown
      ? false
      : allowFrom === "any"
        ? true
        : allowFrom.includes(senderId);

    if (policy.dmPolicy === "deny") {
      return this.blockMessage(message, "Direct messages are disabled for this channel");
    }

    if (senderAllowed || this.isPaired(message.channel, senderId)) {
      return this.routeMessage(message, policy, route);
    }

    if (policy.dmPolicy === "pairing") {
      const pairingTtlMs = policy.pairingCodeTtlMs ?? this.pairingTtlMs;
      return this.handlePairing(message, senderId, pairingTtlMs);
    }

    return this.blockMessage(message, "Sender not allowed by channel policy");
  }

  private async routeMessage(
    message: ChannelMessage,
    policy: ChannelConfig,
    route: ChannelRouteHandler
  ): Promise<ChannelRouteResult> {
    const sessionId = policy.sessionId ?? this.defaultSessionId;
    if (!sessionId) {
      return this.blockMessage(message, "No session configured for channel");
    }

    try {
      await route(sessionId, message);
      return { status: "routed", sessionId };
    } catch (error) {
      this.logger.error("Failed to route channel message", error, {
        channel: message.channel,
        sessionId,
      });
      return { status: "blocked", reason: "Routing failed" };
    }
  }

  private async handlePairing(
    message: ChannelMessage,
    senderId: string,
    pairingTtlMs: number
  ): Promise<ChannelRouteResult> {
    const pairingKey = `${message.channel}:${senderId}`;
    const pending = this.resolvePendingPairing(pairingKey);
    const submittedCode = extractPairingCode(message.text);

    if (pending && submittedCode && submittedCode === pending.code) {
      this.pendingPairings.delete(pairingKey);
      this.markPaired(message.channel, senderId);
      await this.sendMessage(message, "✅ Pairing confirmed. You may continue.");
      return { status: "paired" };
    }

    if (pending && pending.expiresAt > Date.now()) {
      await this.sendMessage(message, `Pairing required. Reply with code: ${pending.code}`);
      return { status: "blocked", reason: "Pairing required" };
    }

    const code = this.generatePairingCode();
    this.pendingPairings.set(pairingKey, { code, expiresAt: Date.now() + pairingTtlMs });
    await this.sendMessage(message, `Pairing required. Reply with code: ${code}`);
    return { status: "blocked", reason: "Pairing required" };
  }

  private resolvePendingPairing(pairingKey: string): PairingState | undefined {
    const pending = this.pendingPairings.get(pairingKey);
    if (!pending) {
      return undefined;
    }
    if (pending.expiresAt <= Date.now()) {
      this.pendingPairings.delete(pairingKey);
      return undefined;
    }
    return pending;
  }

  private async sendMessage(message: ChannelMessage, text: string): Promise<void> {
    const adapter = this.registry.getAdapterByChannel(message.channel);
    if (!adapter) {
      this.logger.warn("Missing adapter for channel pairing response", {
        channel: message.channel,
      });
      return;
    }
    const target: ChannelTarget = {
      channel: message.channel,
      conversationId: message.conversationId,
    };
    await adapter.sendMessage(target, text);
  }

  private markPaired(channel: string, senderId: string): void {
    const set = this.pairedSenders.get(channel) ?? new Set<string>();
    set.add(senderId);
    this.pairedSenders.set(channel, set);
  }

  private isPaired(channel: string, senderId: string): boolean {
    return this.pairedSenders.get(channel)?.has(senderId) ?? false;
  }

  private blockMessage(message: ChannelMessage, reason: string): ChannelRouteResult {
    this.logger.warn("Channel message blocked", {
      channel: message.channel,
      conversationId: message.conversationId,
      reason,
    });
    return { status: "blocked", reason };
  }
}

function normalizePolicy(policy?: ChannelConfig): ChannelConfig {
  return {
    allowFrom: policy?.allowFrom ?? "any",
    dmPolicy: policy?.dmPolicy ?? "allow",
    groups: policy?.groups ?? [],
    sessionId: policy?.sessionId,
    pairingCodeTtlMs: policy?.pairingCodeTtlMs,
  };
}

function generatePairingCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function extractPairingCode(text: string): string | undefined {
  const trimmed = text.trim();
  if (!trimmed) {
    return undefined;
  }
  const prefixed = trimmed.match(/(?:pair|code)\s+([A-Za-z0-9]{4,12})/i);
  if (prefixed?.[1]) {
    return prefixed[1];
  }
  const digits = trimmed.match(/([0-9]{4,12})/);
  if (digits?.[1]) {
    return digits[1];
  }
  const token = trimmed.match(/([A-Za-z0-9]{4,12})/);
  return token?.[1];
}
