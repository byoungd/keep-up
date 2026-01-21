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

const browserError = new Error("Streaming markdown native bindings are not available in browser.");

export function getNativeStreamingMarkdownParser(): NativeStreamingMarkdownBinding | null {
  return null;
}

export function getNativeStreamingMarkdownParserError(): Error | null {
  return browserError;
}
