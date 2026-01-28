import { createSubsystemLogger, type Logger } from "@ku0/agent-runtime-telemetry/logging";
import type { ChannelRegistry } from "../channels/registry";
import type {
  ChannelConfig,
  ChannelMessage,
  ChannelTarget,
  RoutingContext,
  SessionKey,
} from "../channels/types";

export interface ChannelRouterConfig {
  registry: ChannelRegistry;
  logger?: Logger;
  defaultSessionKey?: SessionKey;
  defaultPolicy?: ChannelConfig;
  pairing?: {
    ttlMs?: number;
    generateCode?: () => string;
  };
}

export type ChannelRouteHandler = (
  context: RoutingContext,
  message: ChannelMessage
) => Promise<void> | void;

export type ChannelRouteStatus = "routed" | "blocked" | "paired";

export interface ChannelRouteResult {
  status: ChannelRouteStatus;
  sessionKey?: SessionKey;
  reason?: string;
}

interface PairingState {
  code: string;
  expiresAt: number;
}

export class ChannelRouter {
  private readonly registry: ChannelRegistry;
  private readonly logger: Logger;
  private readonly defaultSessionKey?: SessionKey;
  private readonly defaultPolicy: ChannelConfig;
  private readonly pairingTtlMs: number;
  private readonly generatePairingCode: () => string;
  private readonly pendingPairings = new Map<string, PairingState>();
  private readonly pairedSenders = new Map<string, Set<string>>();

  constructor(config: ChannelRouterConfig) {
    this.registry = config.registry;
    this.logger = config.logger ?? createSubsystemLogger("gateway", "routing");
    this.defaultSessionKey = config.defaultSessionKey;
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
      ...(this.registry.getChannelConfig(message.channelId) ?? {}),
    });

    if (policy.groups?.includes(message.conversationId)) {
      return this.routeMessage(message, policy, route);
    }

    const peerId = message.peerId ?? "unknown";
    const allowFrom = policy.allowFrom ?? "any";
    const isPairingMode = policy.dmPolicy === "pairing";
    const allowFromAnyIsUnknown = isPairingMode && allowFrom === "any";
    const senderAllowed = allowFromAnyIsUnknown
      ? false
      : allowFrom === "any"
        ? true
        : allowFrom.includes(peerId);

    if (policy.dmPolicy === "deny") {
      return this.blockMessage(message, "Direct messages are disabled for this channel");
    }

    if (senderAllowed || this.isPaired(message.channelId, peerId)) {
      return this.routeMessage(message, policy, route);
    }

    if (policy.dmPolicy === "pairing") {
      const pairingTtlMs = policy.pairingCodeTtlMs ?? this.pairingTtlMs;
      return this.handlePairing(message, peerId, pairingTtlMs);
    }

    return this.blockMessage(message, "Sender not allowed by channel policy");
  }

  private async routeMessage(
    message: ChannelMessage,
    policy: ChannelConfig,
    route: ChannelRouteHandler
  ): Promise<ChannelRouteResult> {
    const sessionKey = resolveSessionKey(policy, this.defaultSessionKey);
    if (!sessionKey) {
      return this.blockMessage(message, "No session configured for channel");
    }

    const context: RoutingContext = {
      channelId: message.channelId,
      sessionKey,
      peerId: message.peerId,
    };

    try {
      await route(context, message);
      return { status: "routed", sessionKey };
    } catch (error) {
      this.logger.error("Failed to route channel message", error, {
        channelId: message.channelId,
        sessionId: sessionKey.sessionId,
      });
      return { status: "blocked", reason: "Routing failed" };
    }
  }

  private async handlePairing(
    message: ChannelMessage,
    peerId: string,
    pairingTtlMs: number
  ): Promise<ChannelRouteResult> {
    const pairingKey = `${message.channelId}:${peerId}`;
    const pending = this.resolvePendingPairing(pairingKey);
    const submittedCode = extractPairingCode(message.text);

    if (pending && submittedCode && submittedCode === pending.code) {
      this.pendingPairings.delete(pairingKey);
      this.markPaired(message.channelId, peerId);
      await this.sendMessage(message, "Pairing confirmed. You may continue.");
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
    const plugin = this.registry.getPlugin(message.channelId);
    if (!plugin?.sendMessage) {
      this.logger.warn("Missing channel plugin for pairing response", {
        channelId: message.channelId,
      });
      return;
    }
    const target: ChannelTarget = {
      channelId: message.channelId,
      conversationId: message.conversationId,
    };
    await plugin.sendMessage(target, text);
  }

  private markPaired(channelId: string, peerId: string): void {
    const set = this.pairedSenders.get(channelId) ?? new Set<string>();
    set.add(peerId);
    this.pairedSenders.set(channelId, set);
  }

  private isPaired(channelId: string, peerId: string): boolean {
    return this.pairedSenders.get(channelId)?.has(peerId) ?? false;
  }

  private blockMessage(message: ChannelMessage, reason: string): ChannelRouteResult {
    this.logger.warn("Channel message blocked", {
      channelId: message.channelId,
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
    sessionKey: policy?.sessionKey,
    pairingCodeTtlMs: policy?.pairingCodeTtlMs,
  };
}

function resolveSessionKey(policy: ChannelConfig, fallback?: SessionKey): SessionKey | undefined {
  return policy.sessionKey ?? fallback;
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
