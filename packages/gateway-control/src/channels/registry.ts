import { createSubsystemLogger, type Logger } from "@ku0/agent-runtime-telemetry/logging";
import type { ChannelAdapter, ChannelMessage, ChannelMessageHandler } from "./types";

export interface ChannelRegistryConfig {
  logger?: Logger;
}

export class ChannelRegistry {
  private readonly adapters = new Map<string, ChannelAdapter>();
  private readonly listeners = new Set<ChannelMessageHandler>();
  private readonly logger: Logger;

  constructor(config?: ChannelRegistryConfig) {
    this.logger = config?.logger ?? createSubsystemLogger("gateway", "channels");
  }

  register(adapter: ChannelAdapter): void {
    if (this.adapters.has(adapter.id)) {
      throw new Error(`Channel adapter already registered: ${adapter.id}`);
    }
    this.adapters.set(adapter.id, adapter);
  }

  getAdapter(id: string): ChannelAdapter | undefined {
    return this.adapters.get(id);
  }

  listAdapters(): ChannelAdapter[] {
    return Array.from(this.adapters.values());
  }

  onMessage(handler: ChannelMessageHandler): () => void {
    this.listeners.add(handler);
    return () => {
      this.listeners.delete(handler);
    };
  }

  async startAll(): Promise<void> {
    for (const adapter of this.adapters.values()) {
      await adapter.start({
        emit: (message) => this.emitMessage(message),
        logger: this.logger.child({ channel: adapter.channel }),
      });
      this.logger.info("Channel adapter started", {
        adapter: adapter.id,
        channel: adapter.channel,
      });
    }
  }

  async stopAll(): Promise<void> {
    for (const adapter of this.adapters.values()) {
      await adapter.stop();
      this.logger.info("Channel adapter stopped", {
        adapter: adapter.id,
        channel: adapter.channel,
      });
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
}
