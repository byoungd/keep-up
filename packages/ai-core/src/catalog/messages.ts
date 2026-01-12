import type { Message } from "../providers";

export function normalizeMessages(messages: Message[]): Message[] {
  return messages
    .filter((m) => m.content && m.content.trim().length > 0)
    .map((m) => ({ ...m, role: m.role }));
}

export function withSystemPrompt(systemPrompt: string | undefined, messages: Message[]): Message[] {
  if (!systemPrompt) {
    return normalizeMessages(messages);
  }
  return normalizeMessages([{ role: "system", content: systemPrompt }, ...messages]);
}
