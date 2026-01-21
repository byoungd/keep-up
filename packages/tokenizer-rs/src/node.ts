import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { CompressedContext, CompressedPayload, NativeMessage, NativeTokenizer } from "./types";

interface NativeBinding {
  countTokens?: (text: string, model: string) => number;
  count_tokens?: (text: string, model: string) => number;
  countTokensBatch?: (texts: string[], model: string) => number[];
  count_tokens_batch?: (texts: string[], model: string) => number[];
  estimateJsonTokens?: (value: unknown, model: string) => number;
  estimate_json_tokens?: (value: unknown, model: string) => number;
  compressContext?: (
    messages: NativeMessage[],
    maxTokens: number,
    preserveLastN: number,
    model?: string
  ) => CompressedContext;
  compress_context?: (
    messages: NativeMessage[],
    maxTokens: number,
    preserveLastN: number,
    model?: string
  ) => CompressedContext;
  compressPayloadZstd?: (
    value: unknown,
    minBytes: number,
    level?: number
  ) => CompressedPayload | null;
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
    join(packageRoot, `tokenizer_rs.${platformArch}.node`),
    join(packageRoot, `index.${platformArch}.node`),
    join(packageRoot, "tokenizer_rs.node"),
    join(packageRoot, "index.node"),
    join(packageRoot, "native", `tokenizer_rs.${platformArch}.node`),
    join(packageRoot, "native", `index.${platformArch}.node`),
    join(packageRoot, "native", "tokenizer_rs.node"),
    join(packageRoot, "native", "index.node"),
    join(packageRoot, "native", "target", "release", "tokenizer_rs.node"),
    join(packageRoot, "native", "target", "debug", "tokenizer_rs.node"),
    join(packageRoot, "npm", platformArch, `tokenizer_rs.${platformArch}.node`),
    join(packageRoot, "npm", platformArch, `index.${platformArch}.node`),
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

  const countTokens = binding.countTokens ?? binding.count_tokens;
  const countTokensBatch = binding.countTokensBatch ?? binding.count_tokens_batch;
  const estimateJsonTokens = binding.estimateJsonTokens ?? binding.estimate_json_tokens;
  const compressContext = binding.compressContext ?? binding.compress_context;
  const compressPayloadZstd = binding.compressPayloadZstd ?? binding.compress_payload_zstd;

  if (!countTokens || !countTokensBatch || !estimateJsonTokens || !compressContext) {
    cachedBindingError = new Error("Tokenizer native binding missing required exports.");
    cachedTokenizer = null;
    return cachedTokenizer;
  }

  cachedTokenizer = {
    countTokens: (text, model) => countTokens(text, model),
    countTokensBatch: (texts, model) => countTokensBatch(texts, model),
    estimateJsonTokens: (value, model) => estimateJsonTokens(value, model),
    compressContext: (messages, maxTokens, preserveLastN, model) =>
      compressContext(messages, maxTokens, preserveLastN, model),
    compressPayloadZstd: (value, minBytes, level) =>
      compressPayloadZstd ? compressPayloadZstd(value, minBytes, level) : null,
  };

  return cachedTokenizer;
}

export function getNativeTokenizerError(): Error | null {
  return cachedBindingError;
}
