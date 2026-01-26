import type { Logger } from "@ku0/agent-runtime-telemetry/logging";
import type { ChannelAdapter, ChannelAdapterContext, ChannelMessage, ChannelTarget } from "./types";

const DEFAULT_POLL_INTERVAL_MS = 2000;
const DEFAULT_POLL_TIMEOUT_SECONDS = 25;

export interface TelegramAdapterConfig {
  token: string;
  pollingIntervalMs?: number;
  longPollTimeoutSeconds?: number;
  baseUrl?: string;
}

interface TelegramUpdateResponse {
  ok: boolean;
  result: TelegramUpdate[];
  description?: string;
}

interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
}

interface TelegramMessage {
  message_id: number;
  date: number;
  text?: string;
  chat: TelegramChat;
  from?: TelegramUser;
}

interface TelegramChat {
  id: number;
  type: string;
  title?: string;
  username?: string;
}

interface TelegramUser {
  id: number;
  username?: string;
  first_name?: string;
  last_name?: string;
}

export class TelegramAdapter implements ChannelAdapter {
  readonly id = "telegram";
  readonly channel = "telegram";

  private readonly token: string;
  private readonly pollingIntervalMs: number;
  private readonly longPollTimeoutSeconds: number;
  private readonly baseUrl: string;
  private logger?: Logger;
  private offset = 0;
  private running = false;
  private abortController?: AbortController;
  private pollLoopPromise?: Promise<void>;

  constructor(config: TelegramAdapterConfig) {
    this.token = config.token;
    this.pollingIntervalMs = config.pollingIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
    this.longPollTimeoutSeconds = config.longPollTimeoutSeconds ?? DEFAULT_POLL_TIMEOUT_SECONDS;
    this.baseUrl = config.baseUrl ?? "https://api.telegram.org";
  }

  async start(context: ChannelAdapterContext): Promise<void> {
    if (this.running) {
      return;
    }
    this.running = true;
    this.logger = context.logger;
    this.abortController = new AbortController();

    const signal = this.abortController.signal;
    this.pollLoopPromise = this.pollLoop(context, signal).catch((error) => {
      if (!signal.aborted) {
        this.logger?.error("Telegram polling loop failed", error);
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
    const chatId = target.conversationId;
    const url = `${this.baseUrl}/bot${this.token}/sendMessage`;
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        chat_id: chatId,
        text,
      }),
    });

    if (!response.ok) {
      this.logger?.warn("Telegram sendMessage failed", {
        status: response.status,
      });
    }
  }

  private async pollLoop(context: ChannelAdapterContext, signal: AbortSignal): Promise<void> {
    while (!signal.aborted) {
      await this.pollOnce(context, signal);
      await sleepWithSignal(this.pollingIntervalMs, signal);
    }
  }

  private async pollOnce(context: ChannelAdapterContext, signal: AbortSignal): Promise<void> {
    const url = new URL(`${this.baseUrl}/bot${this.token}/getUpdates`);
    url.searchParams.set("offset", String(this.offset));
    url.searchParams.set("timeout", String(this.longPollTimeoutSeconds));

    const response = await fetch(url, { signal });
    if (!response.ok) {
      this.logger?.warn("Telegram getUpdates failed", { status: response.status });
      return;
    }

    const payload = (await response.json()) as TelegramUpdateResponse;
    if (!payload.ok) {
      this.logger?.warn("Telegram getUpdates returned error", {
        description: payload.description ?? "unknown",
      });
      return;
    }

    for (const update of payload.result) {
      this.offset = Math.max(this.offset, update.update_id + 1);
      const message = extractTelegramMessage(update);
      if (!message) {
        continue;
      }
      context.emit(message);
    }
  }
}

export function extractTelegramMessage(update: TelegramUpdate): ChannelMessage | null {
  const message = update.message;
  if (!message || !message.text) {
    return null;
  }
  return {
    channel: "telegram",
    conversationId: String(message.chat.id),
    senderId: message.from ? String(message.from.id) : undefined,
    text: message.text,
    timestamp: message.date * 1000,
    raw: update,
  };
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
