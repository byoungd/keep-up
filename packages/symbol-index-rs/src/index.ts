import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

export interface SymbolIndexSymbol {
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

export interface SymbolIndexQueryOptions {
  limit?: number;
  kinds?: string[];
}

export interface SymbolIndexResult {
  symbol: SymbolIndexSymbol;
  score: number;
}

export interface SymbolIndexStats {
  symbolCount: number;
  fileCount: number;
}

export interface NativeSymbolIndex {
  updateFile(path: string, symbols: SymbolIndexSymbol[]): void;
  removeFile(path: string): void;
  query(query: string, options?: SymbolIndexQueryOptions): SymbolIndexResult[];
  stats(): SymbolIndexStats;
}

interface NativeSymbolIndexModule {
  SymbolIndex: new () => NativeSymbolIndex;
}

const require = createRequire(import.meta.url);
let cachedModule: NativeSymbolIndexModule | null | undefined;

function resolvePackageRoot(): string {
  const currentDir = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(currentDir, "..");
}

function resolveNativeBindingPath(): string | null {
  const override = process.env.KU0_SYMBOL_INDEX_NATIVE_PATH?.trim();
  if (override) {
    const resolved = path.isAbsolute(override) ? override : path.resolve(process.cwd(), override);
    return existsSync(resolved) ? resolved : null;
  }

  const root = resolvePackageRoot();
  const candidates = [
    path.join(root, "dist", "symbol_index_rs.node"),
    path.join(root, "dist", "index.node"),
    path.join(root, "symbol_index_rs.node"),
    path.join(root, "index.node"),
  ];

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  return null;
}

function loadNativeModule(): NativeSymbolIndexModule | null {
  if (process.env.KU0_SYMBOL_INDEX_DISABLE_NATIVE === "1") {
    return null;
  }

  if (cachedModule !== undefined) {
    return cachedModule;
  }

  const bindingPath = resolveNativeBindingPath();
  if (!bindingPath) {
    cachedModule = null;
    return null;
  }

  try {
    cachedModule = require(bindingPath) as NativeSymbolIndexModule;
  } catch {
    cachedModule = null;
  }

  return cachedModule;
}

export function createSymbolIndex(): NativeSymbolIndex | null {
  const module = loadNativeModule();
  return module ? new module.SymbolIndex() : null;
}
