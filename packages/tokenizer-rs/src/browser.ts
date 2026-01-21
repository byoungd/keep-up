import { getEncoding, type Tiktoken, type TiktokenEncoding } from "js-tiktoken";
import type { CompressedContext, NativeMessage, NativeTokenizer } from "./types";

const TOKEN_APPROX_CHARS = 4;
const TOOL_CALL_TOKEN_COST = 50;
const TRUNCATE_TOKEN_FLOOR = 50;

const encodings = new Map<TiktokenEncoding, Tiktoken>();

function getEncodingNameForModel(model: string): TiktokenEncoding {
  if (
    model.includes("gpt-4") ||
    model.includes("gpt-3.5") ||
    model.includes("o1") ||
    model.includes("text-embedding-3")
  ) {
    return "cl100k_base";
  }
  return "cl100k_base";
}

function resolveEncoding(model: string): Tiktoken | null {
  const encodingName = getEncodingNameForModel(model);
  const cached = encodings.get(encodingName);
  if (cached) {
    return cached;
  }

  try {
    const encoding = getEncoding(encodingName);
    encodings.set(encodingName, encoding);
    return encoding;
  } catch {
    return null;
  }
}

function approximateTokens(text: string): number {
  if (!text) {
    return 0;
  }
  return Math.ceil(text.length / TOKEN_APPROX_CHARS);
}

function countTokens(text: string, model: string): number {
  if (!text) {
    return 0;
  }
  const encoding = resolveEncoding(model);
  if (!encoding) {
    return approximateTokens(text);
  }
  return encoding.encode(text).length;
}

function countTokensBatch(texts: string[], model: string): number[] {
  if (texts.length === 0) {
    return [];
  }
  const encoding = resolveEncoding(model);
  if (!encoding) {
    return texts.map((text) => approximateTokens(text));
  }
  return texts.map((text) => (text ? encoding.encode(text).length : 0));
}

function estimateJsonTokens(value: unknown, model: string): number {
  try {
    const serialized = JSON.stringify(value);
    if (typeof serialized === "string") {
      return countTokens(serialized, model);
    }
  } catch {
    // Fall through to string conversion.
  }
  return countTokens(String(value), model);
}

function estimateMessageTokens(message: NativeMessage, model: string): number {
  let tokens = 0;

  if (message.content) {
    tokens += countTokens(message.content, model);
  }

  if (message.role === "assistant" && message.toolCalls) {
    tokens += message.toolCalls.length * TOOL_CALL_TOKEN_COST;
  }

  if (message.toolResults) {
    for (const result of message.toolResults) {
      tokens += estimateJsonTokens(result.result, model);
    }
  }

  if (message.role === "tool" && message.result !== undefined) {
    tokens += estimateJsonTokens(message.result, model);
  }

  return tokens;
}

function totalTokensForMessages(messages: NativeMessage[], model: string): number {
  let total = 0;
  for (const message of messages) {
    total += estimateMessageTokens(message, model);
  }
  return total;
}

function truncateText(text: string, maxTokens: number): string {
  const maxChars = maxTokens * TOKEN_APPROX_CHARS;
  if (text.length <= maxChars) {
    return text;
  }

  const truncated = text.substring(0, Math.max(0, maxChars - 10));
  const lastPeriod = truncated.lastIndexOf(".");
  const lastNewline = truncated.lastIndexOf("\n");
  const cutPoint = Math.max(lastPeriod, lastNewline);

  if (cutPoint > maxChars * 0.7) {
    return `${truncated.substring(0, cutPoint + 1)}...`;
  }

  return `${truncated}...`;
}

function compressContext(
  messages: NativeMessage[],
  maxTokens: number,
  preserveLastN: number,
  model = "cl100k_base"
): CompressedContext {
  if (messages.length === 0) {
    return {
      messages,
      totalTokens: 0,
      removedCount: 0,
      compressionRatio: 0,
      selectedIndices: [],
    };
  }

  const preservedStart = Math.max(0, messages.length - preserveLastN);
  const preserved = messages.slice(preservedStart);
  const preservedTokens = totalTokensForMessages(preserved, model);
  const availableTokens = Math.max(0, maxTokens - preservedTokens);

  const truncated: NativeMessage[] = [];
  const selectedIndices: number[] = [];
  let usedTokens = 0;

  for (let i = preservedStart - 1; i >= 0 && usedTokens < availableTokens; i -= 1) {
    const message = messages[i];
    const messageTokens = estimateMessageTokens(message, model);
    if (usedTokens + messageTokens <= availableTokens) {
      truncated.unshift(message);
      selectedIndices.unshift(i);
      usedTokens += messageTokens;
      continue;
    }

    const remainingTokens = availableTokens - usedTokens;
    if (remainingTokens > TRUNCATE_TOKEN_FLOOR && message.content) {
      const truncatedContent = truncateText(message.content, remainingTokens);
      if (truncatedContent) {
        const truncatedMessage: NativeMessage = {
          ...message,
          content: truncatedContent,
        };
        truncated.unshift(truncatedMessage);
        selectedIndices.unshift(i);
        usedTokens += estimateMessageTokens(truncatedMessage, model);
      }
    }
    break;
  }

  const resultMessages = [...truncated, ...preserved];
  const totalTokens = totalTokensForMessages(resultMessages, model);
  const removedCount = messages.length - resultMessages.length;
  const compressionRatio = 1 - resultMessages.length / messages.length;
  const preservedIndices = Array.from(
    { length: messages.length - preservedStart },
    (_, idx) => preservedStart + idx
  );

  return {
    messages: resultMessages,
    totalTokens,
    removedCount,
    compressionRatio,
    selectedIndices: [...selectedIndices, ...preservedIndices],
  };
}

const browserTokenizer: NativeTokenizer = {
  countTokens,
  countTokensBatch,
  estimateJsonTokens,
  compressContext,
  compressPayloadZstd: (_value, _minBytes, _level) => null,
};

export function getNativeTokenizer(): NativeTokenizer | null {
  return browserTokenizer;
}

export function getNativeTokenizerError(): Error | null {
  return null;
}

export type {
  CompressedContext,
  CompressedPayload,
  NativeMessage,
  NativeTokenizer,
  NativeToolCall,
  NativeToolResult,
} from "./types";
