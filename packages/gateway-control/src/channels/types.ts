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
}

export type ChannelMessageHandler = (message: ChannelMessage) => void;
