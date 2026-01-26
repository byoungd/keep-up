import type { Logger } from "@ku0/agent-runtime-telemetry/logging";
import type { ChannelAdapter, ChannelAdapterContext, ChannelMessage, ChannelTarget } from "./types";

const DEFAULT_POLL_INTERVAL_MS = 2000;

export interface DiscordAdapterConfig {
  token: string;
  channelId: string;
  pollingIntervalMs?: number;
  baseUrl?: string;
}

interface DiscordUser {
  id: string;
  username?: string;
  bot?: boolean;
}

interface DiscordMessage {
  id: string;
  content?: string;
  timestamp: string;
  author?: DiscordUser;
}

export class DiscordAdapter implements ChannelAdapter {
  readonly id = "discord";
  readonly channel = "discord";

  private readonly token: string;
  private readonly channelId: string;
  private readonly pollingIntervalMs: number;
  private readonly baseUrl: string;
  private logger?: Logger;
  private running = false;
  private abortController?: AbortController;
  private pollLoopPromise?: Promise<void>;
  private lastMessageId?: string;
  private selfId?: string;

  constructor(config: DiscordAdapterConfig) {
    this.token = config.token;
    this.channelId = config.channelId;
    this.pollingIntervalMs = config.pollingIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
    this.baseUrl = config.baseUrl ?? "https://discord.com/api/v10";
  }

  async start(context: ChannelAdapterContext): Promise<void> {
    if (this.running) {
      return;
    }
    this.running = true;
    this.logger = context.logger;
    this.abortController = new AbortController();

    const signal = this.abortController.signal;
    await this.resolveSelfId(signal);
    this.pollLoopPromise = this.pollLoop(context, signal).catch((error) => {
      if (!signal.aborted) {
        this.logger?.error("Discord polling loop failed", error);
      }
    });
  }

  async stop(): Promise<void> {
    if (!this.running) {
      return;
    }
    this.running = false;
    this.abortController?.abort();
    await this.pollLoopPromise?.catch(() => undefined);
  }

  async sendMessage(target: ChannelTarget, text: string): Promise<void> {
    const channelId = target.conversationId;
    const url = `${this.baseUrl}/channels/${channelId}/messages`;
    const response = await fetch(url, {
      method: "POST",
      headers: this.buildHeaders(),
      body: JSON.stringify({ content: text }),
    });

    if (!response.ok) {
      this.logger?.warn("Discord sendMessage failed", { status: response.status });
    }
  }

  private async pollLoop(context: ChannelAdapterContext, signal: AbortSignal): Promise<void> {
    while (!signal.aborted) {
      await this.pollOnce(context, signal);
      await sleepWithSignal(this.pollingIntervalMs, signal);
    }
  }

  private async pollOnce(context: ChannelAdapterContext, signal: AbortSignal): Promise<void> {
    const url = new URL(`${this.baseUrl}/channels/${this.channelId}/messages`);
    if (this.lastMessageId) {
      url.searchParams.set("after", this.lastMessageId);
    }
    url.searchParams.set("limit", "50");

    const response = await fetch(url, { headers: this.buildHeaders(), signal });
    if (!response.ok) {
      this.logger?.warn("Discord list messages failed", { status: response.status });
      return;
    }

    const messages = (await response.json()) as DiscordMessage[];
    if (!Array.isArray(messages) || messages.length === 0) {
      return;
    }

    const ordered = messages.slice().reverse();
    for (const message of ordered) {
      this.updateLastMessageId(message.id);
      if (this.selfId && message.author?.id === this.selfId) {
        continue;
      }
      const parsed = extractDiscordMessage(message, this.channelId);
      if (parsed) {
        context.emit(parsed);
      }
    }
  }

  private async resolveSelfId(signal: AbortSignal): Promise<void> {
    try {
      const response = await fetch(`${this.baseUrl}/users/@me`, {
        headers: this.buildHeaders(),
        signal,
      });
      if (!response.ok) {
        this.logger?.warn("Discord self lookup failed", { status: response.status });
        return;
      }
      const payload = (await response.json()) as { id?: string };
      if (payload.id) {
        this.selfId = payload.id;
      }
    } catch (error) {
      if (!signal.aborted) {
        this.logger?.warn("Discord self lookup error", { error: String(error) });
      }
    }
  }

  private updateLastMessageId(id: string): void {
    if (!id) {
      return;
    }
    if (!this.lastMessageId) {
      this.lastMessageId = id;
      return;
    }
    if (compareSnowflakes(id, this.lastMessageId) > 0) {
      this.lastMessageId = id;
    }
  }

  private buildHeaders(): Record<string, string> {
    return {
      Authorization: `Bot ${this.token}`,
      "Content-Type": "application/json",
    };
  }
}

export function extractDiscordMessage(
  message: DiscordMessage,
  channelId: string
): ChannelMessage | null {
  const content = message.content?.trim();
  if (!content) {
    return null;
  }
  const timestamp = Date.parse(message.timestamp);
  return {
    channel: "discord",
    conversationId: channelId,
    senderId: message.author?.id,
    text: content,
    timestamp: Number.isNaN(timestamp) ? Date.now() : timestamp,
    raw: message,
  };
}

function compareSnowflakes(a: string, b: string): number {
  try {
    const left = BigInt(a);
    const right = BigInt(b);
    if (left === right) {
      return 0;
    }
    return left > right ? 1 : -1;
  } catch {
    return a.localeCompare(b);
  }
}

async function sleepWithSignal(delayMs: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) {
    return;
  }

  await new Promise<void>((resolve) => {
    const timeout = setTimeout(resolve, delayMs);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(timeout);
        resolve();
      },
      { once: true }
    );
  });
}
