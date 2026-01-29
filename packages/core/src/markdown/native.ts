import {
  getNativeMarkdownContent,
  type NativeMarkdownContentBinding,
} from "@ku0/markdown-content-rs";
import type { LineRange, MarkdownCodeSymbolKind } from "./types.js";

export function resolveNativeMarkdownContent(): NativeMarkdownContentBinding | null {
  return getNativeMarkdownContent();
}

export function resolveCodeBlockSymbol(
  content: string,
  language: string,
  symbol: { name: string; kind: MarkdownCodeSymbolKind }
): LineRange | null {
  const native = resolveNativeMarkdownContent();
  if (native?.resolveCodeSymbol) {
    try {
      return native.resolveCodeSymbol(content, language, symbol.name, symbol.kind);
    } catch {
      // fall through to fallback
    }
  }
  return resolveCodeSymbolFallback(content, symbol);
}

function resolveCodeSymbolFallback(
  content: string,
  symbol: { name: string; kind: MarkdownCodeSymbolKind }
): LineRange | null {
  const name = symbol.name.trim();
  if (!name) {
    return null;
  }
  const lines = content.split(/\r\n?|\n/);
  const patterns = buildFallbackPatterns(symbol.kind, name);
  if (patterns.length === 0) {
    return null;
  }
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (patterns.some((pattern) => pattern.test(line))) {
      return { start: i + 1, end: i + 1 };
    }
  }
  return null;
}

function buildFallbackPatterns(kind: MarkdownCodeSymbolKind, name: string): RegExp[] {
  const escaped = escapeRegExp(name);
  switch (kind) {
    case "function":
      return [
        new RegExp(`^\\s*(export\\s+)?(async\\s+)?function\\s+${escaped}\\b`),
        new RegExp(`^\\s*def\\s+${escaped}\\b`),
        new RegExp(`^\\s*fn\\s+${escaped}\\b`),
      ];
    case "class":
      return [
        new RegExp(`^\\s*(export\\s+)?class\\s+${escaped}\\b`),
        new RegExp(`^\\s*struct\\s+${escaped}\\b`),
        new RegExp(`^\\s*enum\\s+${escaped}\\b`),
      ];
    case "variable":
      return [
        new RegExp(`^\\s*(export\\s+)?(const|let|var)\\s+${escaped}\\b`),
        new RegExp(`^\\s*let\\s+(mut\\s+)?${escaped}\\b`),
        new RegExp(`^\\s*${escaped}\\s*=`),
      ];
    case "import":
      return [
        new RegExp(`^\\s*import\\s+.*\\b${escaped}\\b`),
        new RegExp(`^\\s*from\\s+.*\\s+import\\s+.*\\b${escaped}\\b`),
        new RegExp(`^\\s*use\\s+.*\\b${escaped}\\b`),
      ];
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
