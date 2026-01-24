import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { CompressedContext, CompressedPayload, NativeMessage, NativeTokenizer } from "./types";

interface NativeBinding {
  count_tokens: (text: string, model: string) => number;
  count_tokens_batch: (texts: string[], model: string) => number[];
  estimate_json_tokens: (value: unknown, model: string) => number;
  compress_context: (
    messages: NativeMessage[],
    maxTokens: number,
    preserveLastN: number,
    model?: string
  ) => CompressedContext;
  compress_payload_zstd?: (
    value: unknown,
    minBytes: number,
    level?: number
  ) => CompressedPayload | null;
}

export type {
  CompressedContext,
  CompressedPayload,
  NativeMessage,
  NativeTokenizer,
  NativeToolCall,
  NativeToolResult,
} from "./types";

let cachedTokenizer: NativeTokenizer | null | undefined;
let cachedBindingError: Error | null = null;

function loadNativeBinding(): NativeBinding | null {
  const require = createRequire(import.meta.url);
  const baseDir = dirname(fileURLToPath(import.meta.url));
  const packageRoot = join(baseDir, "..");

  const candidates = buildCandidatePaths(packageRoot);
  const envPath = process.env.TOKENIZER_RS_NATIVE_PATH;
  if (envPath) {
    candidates.unshift(envPath);
  }

  for (const candidate of candidates) {
    if (!existsSync(candidate)) {
      continue;
    }
    try {
      return require(candidate) as NativeBinding;
    } catch (error) {
      if (error instanceof Error) {
        cachedBindingError = error;
      }
    }
  }

  return null;
}

function buildCandidatePaths(packageRoot: string): string[] {
  const platformArch = `${process.platform}-${process.arch}`;
  return [
    join(packageRoot, "tokenizer_rs.node"),
    join(packageRoot, "index.node"),
    join(packageRoot, `tokenizer_rs.${platformArch}.node`),
    join(packageRoot, `index.${platformArch}.node`),
    join(packageRoot, "native", "tokenizer_rs.node"),
    join(packageRoot, "native", "index.node"),
    join(packageRoot, "native", "target", "release", "tokenizer_rs.node"),
    join(packageRoot, "native", "target", "debug", "tokenizer_rs.node"),
    join(packageRoot, "npm", platformArch, "tokenizer_rs.node"),
    join(packageRoot, "npm", platformArch, "index.node"),
  ];
}

export function getNativeTokenizer(): NativeTokenizer | null {
  if (cachedTokenizer !== undefined) {
    return cachedTokenizer;
  }

  const binding = loadNativeBinding();
  if (!binding) {
    cachedTokenizer = null;
    return cachedTokenizer;
  }

  cachedTokenizer = {
    countTokens: (text, model) => binding.count_tokens(text, model),
    countTokensBatch: (texts, model) => binding.count_tokens_batch(texts, model),
    estimateJsonTokens: (value, model) => binding.estimate_json_tokens(value, model),
    compressContext: (messages, maxTokens, preserveLastN, model) =>
      binding.compress_context(messages, maxTokens, preserveLastN, model),
    compressPayloadZstd: (value, minBytes, level) =>
      binding.compress_payload_zstd ? binding.compress_payload_zstd(value, minBytes, level) : null,
  };

  return cachedTokenizer;
}

export function getNativeTokenizerError(): Error | null {
  return cachedBindingError;
}
