import type { Message } from "@ku0/ai-core";
import type { ModelMessage } from "ai";

export function toModelMessages(messages: Message[]): ModelMessage[] {
  return messages.map((message) => ({
    role: message.role,
    content: message.content,
  }));
}
