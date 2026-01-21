import * as path from "node:path";
import { createSymbolIndex, type NativeSymbolIndex } from "@ku0/symbol-index-rs";
import type { LspSymbol } from "@ku0/tool-lsp";

export interface SymbolDescriptor {
  name: string;
  kind: string;
  file: string;
  line: number;
  column: number;
  endLine: number;
  endColumn: number;
  container?: string;
  detail?: string;
}

export interface SymbolQueryOptions {
  limit?: number;
  kinds?: string[];
}

export interface SymbolQueryResult {
  symbol: SymbolDescriptor;
  score: number;
}

const DEFAULT_QUERY_LIMIT = 20;

type LspSymbolWithDetail = LspSymbol & { detail?: string };

type NativeQueryOptions = {
  limit?: number;
  kinds?: string[];
};

export class SymbolGraph {
  private readonly nativeIndex: NativeSymbolIndex | null;
  private readonly memoryIndex: MemorySymbolGraph | null;
  private readonly fileSymbolCounts = new Map<string, number>();

  constructor() {
    this.nativeIndex = createSymbolIndex();
    this.memoryIndex = this.nativeIndex ? null : new MemorySymbolGraph();
  }

  updateFileSymbols(filePath: string, symbols: LspSymbol[]): { added: number; removed: number } {
    if (this.memoryIndex) {
      return this.memoryIndex.updateFileSymbols(filePath, symbols);
    }

    const normalized = normalizeFilePath(filePath);
    const previousCount = this.fileSymbolCounts.get(normalized) ?? 0;
    const nativeIndex = this.nativeIndex;
    const flattened = flattenSymbols(symbols as LspSymbolWithDetail[]).map((symbol) => ({
      ...symbol,
      file: normalizeFilePath(symbol.file),
    }));

    if (!nativeIndex) {
      return { added: 0, removed: previousCount };
    }

    nativeIndex.updateFile(normalized, flattened);
    if (flattened.length > 0) {
      this.fileSymbolCounts.set(normalized, flattened.length);
    } else {
      this.fileSymbolCounts.delete(normalized);
    }

    return { added: flattened.length, removed: previousCount };
  }

  removeFile(filePath: string): void {
    if (this.memoryIndex) {
      this.memoryIndex.removeFile(filePath);
      return;
    }

    const normalized = normalizeFilePath(filePath);
    const nativeIndex = this.nativeIndex;
    if (!nativeIndex) {
      return;
    }
    nativeIndex.removeFile(normalized);
    this.fileSymbolCounts.delete(normalized);
  }

  query(query: string, options: SymbolQueryOptions = {}): SymbolQueryResult[] {
    if (this.memoryIndex) {
      return this.memoryIndex.query(query, options);
    }

    const nativeIndex = this.nativeIndex;
    if (!nativeIndex) {
      return [];
    }

    const nativeOptions = toNativeQueryOptions(options);
    return nativeIndex.query(query, nativeOptions);
  }

  getStats(): { symbolCount: number; fileCount: number } {
    if (this.memoryIndex) {
      return this.memoryIndex.getStats();
    }

    const nativeIndex = this.nativeIndex;
    if (!nativeIndex) {
      return { symbolCount: 0, fileCount: 0 };
    }

    return nativeIndex.stats();
  }
}

class MemorySymbolGraph {
  private readonly symbolsByFile = new Map<string, SymbolDescriptor[]>();
  private readonly symbolsByName = new Map<string, SymbolDescriptor[]>();

  updateFileSymbols(filePath: string, symbols: LspSymbol[]): { added: number; removed: number } {
    const normalized = normalizeFilePath(filePath);
    const previous = this.symbolsByFile.get(normalized) ?? [];
    if (previous.length > 0) {
      this.removeSymbols(previous);
    }

    const flattened = flattenSymbols(symbols as LspSymbolWithDetail[]).map((symbol) => ({
      ...symbol,
      file: normalizeFilePath(symbol.file),
    }));

    this.symbolsByFile.set(normalized, flattened);
    this.addSymbols(flattened);

    return { added: flattened.length, removed: previous.length };
  }

  removeFile(filePath: string): void {
    const normalized = normalizeFilePath(filePath);
    const previous = this.symbolsByFile.get(normalized);
    if (!previous) {
      return;
    }
    this.removeSymbols(previous);
    this.symbolsByFile.delete(normalized);
  }

  query(query: string, options: SymbolQueryOptions = {}): SymbolQueryResult[] {
    const tokens = tokenize(query);
    if (tokens.length === 0) {
      return [];
    }

    const allowedKinds = options.kinds?.map((kind) => kind.toLowerCase());
    const results: SymbolQueryResult[] = [];

    for (const symbols of this.symbolsByName.values()) {
      for (const symbol of symbols) {
        if (allowedKinds && !allowedKinds.includes(symbol.kind.toLowerCase())) {
          continue;
        }

        const score = scoreSymbol(tokens, symbol);
        if (score > 0) {
          results.push({ symbol, score });
        }
      }
    }

    results.sort((a, b) => b.score - a.score || a.symbol.name.localeCompare(b.symbol.name));

    const limit = options.limit ?? DEFAULT_QUERY_LIMIT;
    return results.slice(0, limit);
  }

  getStats(): { symbolCount: number; fileCount: number } {
    let symbolCount = 0;
    for (const symbols of this.symbolsByFile.values()) {
      symbolCount += symbols.length;
    }
    return { symbolCount, fileCount: this.symbolsByFile.size };
  }

  private addSymbols(symbols: SymbolDescriptor[]): void {
    for (const symbol of symbols) {
      const key = normalizeToken(symbol.name);
      const existing = this.symbolsByName.get(key);
      if (existing) {
        existing.push(symbol);
      } else {
        this.symbolsByName.set(key, [symbol]);
      }
    }
  }

  private removeSymbols(symbols: SymbolDescriptor[]): void {
    for (const symbol of symbols) {
      const key = normalizeToken(symbol.name);
      const existing = this.symbolsByName.get(key);
      if (!existing) {
        continue;
      }
      const filtered = existing.filter((entry) => entry !== symbol);
      if (filtered.length === 0) {
        this.symbolsByName.delete(key);
      } else {
        this.symbolsByName.set(key, filtered);
      }
    }
  }
}

function normalizeFilePath(filePath: string): string {
  return path.resolve(filePath);
}

function toNativeQueryOptions(options: SymbolQueryOptions): NativeQueryOptions | undefined {
  if (options.limit === undefined && options.kinds === undefined) {
    return undefined;
  }

  return {
    limit: options.limit,
    kinds: options.kinds,
  };
}

function flattenSymbols(symbols: LspSymbolWithDetail[], container?: string): SymbolDescriptor[] {
  const flattened: SymbolDescriptor[] = [];

  for (const symbol of symbols) {
    flattened.push({
      name: symbol.name,
      kind: symbol.kind,
      file: symbol.file,
      line: symbol.line,
      column: symbol.column,
      endLine: symbol.endLine,
      endColumn: symbol.endColumn,
      container,
      detail: symbol.detail,
    });

    if (symbol.children && symbol.children.length > 0) {
      const nextContainer = container ? `${container}.${symbol.name}` : symbol.name;
      flattened.push(...flattenSymbols(symbol.children as LspSymbolWithDetail[], nextContainer));
    }
  }

  return flattened;
}

function tokenize(input: string): string[] {
  const normalized = normalizeToken(input);
  if (!normalized) {
    return [];
  }
  const pieces = normalized.split(/[^a-z0-9]+/);
  const unique = new Set<string>();
  for (const piece of pieces) {
    if (piece.length < 2) {
      continue;
    }
    unique.add(piece);
  }
  return Array.from(unique);
}

function normalizeToken(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function scoreSymbol(tokens: string[], symbol: SymbolDescriptor): number {
  const name = normalizeToken(symbol.name);
  const container = symbol.container ? normalizeToken(symbol.container) : "";
  const detail = symbol.detail ? normalizeToken(symbol.detail) : "";

  let score = 0;
  for (const token of tokens) {
    score += scoreToken(token, name) * 2;
    if (container) {
      score += scoreToken(token, container);
    }
    if (detail) {
      score += scoreToken(token, detail);
    }
  }

  return score;
}

function scoreToken(token: string, text: string): number {
  if (!text) {
    return 0;
  }
  if (text === token) {
    return 6;
  }
  if (text.startsWith(token)) {
    return 4;
  }
  if (text.includes(token)) {
    return 2;
  }
  return 0;
}
