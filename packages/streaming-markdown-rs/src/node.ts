import path from "node:path";
import { fileURLToPath } from "node:url";
import { nativeFlagStore } from "@ku0/native-bindings/flags";
import { loadNativeBinding } from "@ku0/native-bindings/node";
import type { NativeStreamingMarkdownBinding } from "./types";

export type {
  ASTNode,
  CacheStats,
  NativeStreamingMarkdownBinding,
  NativeStreamingMarkdownParser,
  NodeType,
  ParseResult,
  ParserOptions,
  ParserStateSnapshot,
} from "./types";

let cachedBinding: NativeStreamingMarkdownBinding | null | undefined;
let cachedError: Error | null = null;

function readDisableFlag(value: string | undefined): boolean {
  if (!value) {
    return false;
  }
  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes";
}

function isNativeEnabled(): boolean {
  if (readDisableFlag(process.env.KU0_STREAMING_MARKDOWN_DISABLE_NATIVE)) {
    return false;
  }
  return nativeFlagStore.getFlag("native_accelerators_enabled");
}

function resolvePackageRoot(): string {
  const currentDir = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(currentDir, "..");
}

export function getNativeStreamingMarkdownParser(): NativeStreamingMarkdownBinding | null {
  if (!isNativeEnabled()) {
    return null;
  }

  if (cachedBinding !== undefined) {
    return cachedBinding;
  }

  const result = loadNativeBinding<NativeStreamingMarkdownBinding>({
    packageRoot: resolvePackageRoot(),
    bindingNames: ["streaming_markdown_rs", "index"],
    envVar: "KU0_STREAMING_MARKDOWN_NATIVE_PATH",
    requiredExports: ["StreamingMarkdownParser"],
    logTag: "Streaming markdown native binding",
  });

  cachedError = result.error;
  cachedBinding = result.binding;
  return cachedBinding ?? null;
}

export function getNativeStreamingMarkdownParserError(): Error | null {
  return cachedError;
}
