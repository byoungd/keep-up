export type SseChunk = {
  choices?: Array<{
    delta?: { content?: unknown };
    message?: { content?: unknown };
    content?: unknown;
  }>;
};

function extractTextFromObject(value: Record<string, unknown>): string {
  const text = value.text;
  return typeof text === "string" ? text : "";
}

function extractTextFromPart(part: unknown): string {
  if (typeof part === "string") {
    return part;
  }
  if (!part || typeof part !== "object") {
    return "";
  }
  return extractTextFromObject(part as Record<string, unknown>);
}

function flattenContent(content: unknown): string {
  if (typeof content === "string") {
    return content;
  }

  if (Array.isArray(content)) {
    return content.map((part) => extractTextFromPart(part)).join("");
  }

  if (content && typeof content === "object") {
    return extractTextFromObject(content as Record<string, unknown>);
  }

  return "";
}

/**
 * Parses an SSE payload line (without the leading `data:`) and returns the text delta.
 * Handles both `delta.content` and `message.content` shapes.
 */
export function parseSseText(payload: string): string {
  if (!payload || payload === "[DONE]") {
    return "";
  }

  let parsed: SseChunk;
  try {
    parsed = JSON.parse(payload) as SseChunk;
  } catch {
    return "";
  }

  const choice = parsed.choices?.[0];
  const delta = choice?.delta?.content ?? choice?.content;
  const message = choice?.message?.content;

  const deltaText = flattenContent(delta);
  if (deltaText) {
    return deltaText;
  }

  const messageText = flattenContent(message);
  if (messageText) {
    return messageText;
  }

  return "";
}
