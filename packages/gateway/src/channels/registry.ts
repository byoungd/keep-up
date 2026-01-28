import { createSubsystemLogger, type Logger } from "@ku0/agent-runtime-telemetry/logging";
import type {
  ChannelConfig,
  ChannelHealth,
  ChannelMessage,
  ChannelPlugin,
  ChannelPluginContext,
  ChannelRegistryStatus,
  ChannelStatus,
} from "./types";

export interface ChannelRegistryConfig {
  logger?: Logger;
}

interface ChannelRegistration {
  plugin: ChannelPlugin;
  config: ChannelConfig;
  running: boolean;
  health?: ChannelHealth;
  lastHealthCheckAt?: number;
  lastError?: string;
}

export type ChannelMessageHandler = (message: ChannelMessage) => void;

export class ChannelRegistry {
  private readonly plugins = new Map<string, ChannelRegistration>();
  private readonly listeners = new Set<ChannelMessageHandler>();
  private readonly logger: Logger;

  constructor(config?: ChannelRegistryConfig) {
    this.logger = config?.logger ?? createSubsystemLogger("gateway", "channels");
  }

  register(plugin: ChannelPlugin): void {
    if (this.plugins.has(plugin.id)) {
      throw new Error(`Channel plugin already registered: ${plugin.id}`);
    }
    this.plugins.set(plugin.id, {
      plugin,
      config: normalizeChannelConfig(plugin.config),
      running: false,
      health: defaultHealth(false),
    });
  }

  unregister(pluginId: string): void {
    this.plugins.delete(pluginId);
  }

  getPlugin(pluginId: string): ChannelPlugin | undefined {
    return this.plugins.get(pluginId)?.plugin;
  }

  getChannelConfig(pluginId: string): ChannelConfig | undefined {
    return this.plugins.get(pluginId)?.config;
  }

  listChannels(): ChannelStatus[] {
    return Array.from(this.plugins.values(), (entry) => ({
      id: entry.plugin.id,
      name: entry.plugin.name,
      running: entry.running,
      config: entry.config,
      gatewayMethods: Object.keys(entry.plugin.gatewayMethods ?? {}),
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
    for (const entry of this.plugins.values()) {
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

  emitMessage(message: ChannelMessage): void {
    for (const listener of this.listeners) {
      try {
        listener(message);
      } catch (error) {
        this.logger.warn("Channel message handler failed", { error: String(error) });
      }
    }
  }

  async startAll(): Promise<void> {
    for (const entry of this.plugins.values()) {
      if (entry.running) {
        continue;
      }
      if (!entry.plugin.start) {
        entry.running = true;
        entry.lastError = undefined;
        await this.updateHealth(entry);
        continue;
      }

      try {
        const context: ChannelPluginContext = {
          emit: (message) => this.emitMessage(message),
          logger: this.logger.child({ channel: entry.plugin.id }),
        };
        await entry.plugin.start(context);
        entry.running = true;
        entry.lastError = undefined;
        await this.updateHealth(entry);
        this.logger.info("Channel plugin started", { channel: entry.plugin.id });
      } catch (error) {
        entry.running = false;
        entry.lastError = String(error);
        entry.health = {
          ok: false,
          details: { error: entry.lastError },
        };
        entry.lastHealthCheckAt = Date.now();
        this.logger.error("Channel plugin failed to start", error, {
          channel: entry.plugin.id,
        });
      }
    }
  }

  async stopAll(): Promise<void> {
    for (const entry of this.plugins.values()) {
      if (!entry.running) {
        continue;
      }
      if (!entry.plugin.stop) {
        entry.running = false;
        entry.lastError = undefined;
        await this.updateHealth(entry);
        continue;
      }
      try {
        await entry.plugin.stop();
        entry.running = false;
        entry.lastError = undefined;
        await this.updateHealth(entry);
        this.logger.info("Channel plugin stopped", { channel: entry.plugin.id });
      } catch (error) {
        entry.lastError = String(error);
        entry.health = {
          ok: false,
          details: { error: entry.lastError },
        };
        entry.lastHealthCheckAt = Date.now();
        this.logger.error("Channel plugin failed to stop", error, {
          channel: entry.plugin.id,
        });
      }
    }
  }

  private async updateHealth(entry: ChannelRegistration): Promise<void> {
    if (!entry.running) {
      entry.health = defaultHealth(false);
      entry.lastHealthCheckAt = Date.now();
      return;
    }

    if (entry.plugin.healthCheck) {
      const start = Date.now();
      try {
        const health = await entry.plugin.healthCheck();
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

function normalizeChannelConfig(config?: ChannelConfig): ChannelConfig {
  return {
    allowFrom: config?.allowFrom ?? "any",
    dmPolicy: config?.dmPolicy ?? "allow",
    groups: config?.groups ?? [],
    sessionKey: config?.sessionKey,
    pairingCodeTtlMs: config?.pairingCodeTtlMs,
  };
}

function defaultHealth(running: boolean): ChannelHealth {
  return {
    ok: running,
    details: { status: running ? "running" : "stopped" },
  };
}
