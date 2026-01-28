import { createSubsystemLogger, type Logger } from "@ku0/agent-runtime-telemetry/logging";
import type {
  ChannelAdapter,
  ChannelConfig,
  ChannelHealth,
  ChannelMessage,
  ChannelMessageHandler,
  ChannelPlugin,
  ChannelRegistryStatus,
  ChannelStatus,
} from "./types";

export interface ChannelRegistryConfig {
  logger?: Logger;
}

interface ChannelRegistration {
  id: string;
  adapter: ChannelAdapter;
  name?: string;
  config: ChannelConfig;
  gatewayMethods: string[];
  running: boolean;
  health?: ChannelHealth;
  lastHealthCheckAt?: number;
  lastError?: string;
}

export class ChannelRegistry {
  private readonly adapters = new Map<string, ChannelRegistration>();
  private readonly channelIndex = new Map<string, string>();
  private readonly listeners = new Set<ChannelMessageHandler>();
  private readonly logger: Logger;

  constructor(config?: ChannelRegistryConfig) {
    this.logger = config?.logger ?? createSubsystemLogger("gateway", "channels");
  }

  register(adapterOrPlugin: ChannelAdapter | ChannelPlugin): void {
    const registration = toRegistration(adapterOrPlugin);
    const adapterId = registration.id;
    const channel = registration.adapter.channel;

    if (this.adapters.has(adapterId)) {
      throw new Error(`Channel adapter already registered: ${adapterId}`);
    }
    if (this.channelIndex.has(channel)) {
      throw new Error(`Channel already registered: ${channel}`);
    }

    this.adapters.set(adapterId, registration);
    this.channelIndex.set(channel, adapterId);
  }

  getAdapter(id: string): ChannelAdapter | undefined {
    return this.adapters.get(id)?.adapter;
  }

  listAdapters(): ChannelAdapter[] {
    return Array.from(this.adapters.values(), (entry) => entry.adapter);
  }

  getAdapterByChannel(channel: string): ChannelAdapter | undefined {
    const adapterId = this.channelIndex.get(channel);
    if (!adapterId) {
      return undefined;
    }
    return this.adapters.get(adapterId)?.adapter;
  }

  getChannelConfig(channel: string): ChannelConfig | undefined {
    const adapterId = this.channelIndex.get(channel);
    if (!adapterId) {
      return undefined;
    }
    return this.adapters.get(adapterId)?.config;
  }

  listChannels(): ChannelStatus[] {
    return Array.from(this.adapters.values(), (entry) => ({
      id: entry.id,
      channel: entry.adapter.channel,
      name: entry.name,
      running: entry.running,
      config: entry.config,
      gatewayMethods: entry.gatewayMethods,
      health: entry.health ?? defaultHealth(entry.running),
      lastHealthCheckAt: entry.lastHealthCheckAt,
      lastError: entry.lastError,
    }));
  }

  getStatus(): ChannelRegistryStatus {
    const channels = this.listChannels();
    const running = channels.filter((entry) => entry.running).length;
    const healthy = channels.filter((entry) => entry.health?.ok ?? entry.running).length;
    return {
      total: channels.length,
      running,
      healthy,
      channels,
    };
  }

  async refreshHealth(): Promise<ChannelRegistryStatus> {
    for (const entry of this.adapters.values()) {
      await this.updateHealth(entry);
    }
    return this.getStatus();
  }

  onMessage(handler: ChannelMessageHandler): () => void {
    this.listeners.add(handler);
    return () => {
      this.listeners.delete(handler);
    };
  }

  async startAll(): Promise<void> {
    for (const entry of this.adapters.values()) {
      if (entry.running) {
        continue;
      }
      try {
        await entry.adapter.start({
          emit: (message) => this.emitMessage(message),
          logger: this.logger.child({ channel: entry.adapter.channel }),
        });
        entry.running = true;
        entry.lastError = undefined;
        await this.updateHealth(entry);
        this.logger.info("Channel adapter started", {
          adapter: entry.adapter.id,
          channel: entry.adapter.channel,
        });
      } catch (error) {
        entry.running = false;
        entry.lastError = String(error);
        entry.health = {
          ok: false,
          details: { error: entry.lastError },
        };
        entry.lastHealthCheckAt = Date.now();
        this.logger.error("Channel adapter failed to start", error, {
          adapter: entry.adapter.id,
          channel: entry.adapter.channel,
        });
      }
    }
  }

  async stopAll(): Promise<void> {
    for (const entry of this.adapters.values()) {
      if (!entry.running) {
        continue;
      }
      try {
        await entry.adapter.stop();
        entry.running = false;
        entry.lastError = undefined;
        await this.updateHealth(entry);
        this.logger.info("Channel adapter stopped", {
          adapter: entry.adapter.id,
          channel: entry.adapter.channel,
        });
      } catch (error) {
        entry.lastError = String(error);
        entry.health = {
          ok: false,
          details: { error: entry.lastError },
        };
        entry.lastHealthCheckAt = Date.now();
        this.logger.error("Channel adapter failed to stop", error, {
          adapter: entry.adapter.id,
          channel: entry.adapter.channel,
        });
      }
    }
  }

  private emitMessage(message: ChannelMessage): void {
    for (const listener of this.listeners) {
      try {
        listener(message);
      } catch (error) {
        this.logger.warn("Channel message handler failed", { error: String(error) });
      }
    }
  }

  private async updateHealth(entry: ChannelRegistration): Promise<void> {
    if (!entry.running) {
      entry.health = defaultHealth(false);
      entry.lastHealthCheckAt = Date.now();
      return;
    }

    if (entry.adapter.healthCheck) {
      const start = Date.now();
      try {
        const health = await entry.adapter.healthCheck();
        entry.health =
          health.latencyMs === undefined ? { ...health, latencyMs: Date.now() - start } : health;
      } catch (error) {
        entry.health = {
          ok: false,
          details: { error: String(error) },
        };
        entry.lastError = String(error);
      }
      entry.lastHealthCheckAt = Date.now();
      return;
    }

    entry.health = defaultHealth(entry.running);
    entry.lastHealthCheckAt = Date.now();
  }
}

function toRegistration(adapterOrPlugin: ChannelAdapter | ChannelPlugin): ChannelRegistration {
  if ("adapter" in adapterOrPlugin) {
    return {
      id: adapterOrPlugin.id,
      adapter: adapterOrPlugin.adapter,
      name: adapterOrPlugin.name,
      config: normalizeChannelConfig(adapterOrPlugin.config),
      gatewayMethods: Object.keys(adapterOrPlugin.gatewayMethods ?? {}),
      running: false,
      health: defaultHealth(false),
    };
  }

  return {
    id: adapterOrPlugin.id,
    adapter: adapterOrPlugin,
    name: undefined,
    config: normalizeChannelConfig(undefined),
    gatewayMethods: [],
    running: false,
    health: defaultHealth(false),
  };
}

function normalizeChannelConfig(config?: ChannelConfig): ChannelConfig {
  return {
    allowFrom: config?.allowFrom ?? "any",
    dmPolicy: config?.dmPolicy ?? "allow",
    groups: config?.groups ?? [],
    sessionId: config?.sessionId,
    pairingCodeTtlMs: config?.pairingCodeTtlMs,
  };
}

function defaultHealth(running: boolean): ChannelHealth {
  return {
    ok: running,
    details: { status: running ? "running" : "stopped" },
  };
}
