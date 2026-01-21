import { getDefaultModelId, TokenTracker } from "@ku0/ai-core";
import {
  type CompressedContext,
  type CompressedPayload,
  getNativeTokenizer,
  type NativeMessage,
  type NativeTokenizer,
} from "@ku0/tokenizer-rs";

const DEFAULT_MODEL = getDefaultModelId();
const tracker = new TokenTracker();
let cachedNative: NativeTokenizer | null | undefined;

function resolveNativeTokenizer(): NativeTokenizer | null {
  if (cachedNative === undefined) {
    cachedNative = getNativeTokenizer();
  }
  return cachedNative;
}

export function countTokens(text: string, model: string = DEFAULT_MODEL): number {
  if (!text) {
    return 0;
  }

  const native = resolveNativeTokenizer();
  if (native) {
    try {
      return native.countTokens(text, model);
    } catch {
      // Fall back to JS token counter if native binding fails.
    }
  }

  return tracker.countTokens(text, model);
}

export function countTokensBatch(texts: string[], model: string = DEFAULT_MODEL): number[] {
  if (texts.length === 0) {
    return [];
  }

  const native = resolveNativeTokenizer();
  if (native) {
    try {
      return native.countTokensBatch(texts, model);
    } catch {
      // Fall back to JS token counter if native binding fails.
    }
  }

  return texts.map((text) => (text ? tracker.countTokens(text, model) : 0));
}

export function estimateJsonTokens(value: unknown, model: string = DEFAULT_MODEL): number {
  const native = resolveNativeTokenizer();
  if (native) {
    try {
      return native.estimateJsonTokens(value, model);
    } catch {
      // Fall back to JS token counter if native binding fails.
    }
  }

  try {
    const serialized = JSON.stringify(value);
    if (typeof serialized === "string") {
      return tracker.countTokens(serialized, model);
    }
  } catch {
    // Ignore serialization errors and fall back to string conversion.
  }

  return tracker.countTokens(String(value), model);
}

export function tryCompressContext(
  messages: NativeMessage[],
  maxTokens: number,
  preserveLastN: number,
  model: string = DEFAULT_MODEL
): CompressedContext | null {
  const native = resolveNativeTokenizer();
  if (!native) {
    return null;
  }

  try {
    return native.compressContext(messages, maxTokens, preserveLastN, model);
  } catch {
    return null;
  }
}

export function compressPayloadZstd(
  value: unknown,
  minBytes = 2048,
  level?: number
): CompressedPayload | null {
  const native = resolveNativeTokenizer();
  if (!native) {
    return null;
  }

  try {
    return native.compressPayloadZstd(value, minBytes, level);
  } catch {
    return null;
  }
}
