import { existsSync } from "node:fs";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { createTypeScriptProvider, LspClient, type LspProvider } from "@ku0/tool-lsp";
import chokidar, { type FSWatcher } from "chokidar";

import { LspCodeKnowledgeGraph } from "./codeKnowledgeGraph";
import { ImportGraph } from "./importGraph";
import { SymbolGraph, type SymbolQueryResult } from "./symbolGraph";
import type { SymbolContextOptions, SymbolContextProvider } from "./types";

export interface LspServiceOptions {
  rootPath: string;
  providers?: LspProvider[];
  includeExtensions?: string[];
  excludeDirs?: string[];
  maxFileBytes?: number;
  watch?: boolean;
  updateDebounceMs?: number;
  promptSymbolLimit?: number;
  impactLimit?: number;
  logger?: Pick<Console, "info" | "warn" | "error" | "debug">;
}

export interface LspServiceStartOptions {
  awaitInitialIndex?: boolean;
  indexOnStart?: boolean;
}

export interface SymbolIndexReport {
  totalFiles: number;
  indexedFiles: number;
  skippedFiles: number;
  durationMs: number;
}

const DEFAULT_EXCLUDE_DIRS = [
  ".git",
  "node_modules",
  "dist",
  "build",
  "coverage",
  ".next",
  ".turbo",
  ".keep-up",
  "out",
  "target",
];
const DEFAULT_MAX_FILE_BYTES = 512 * 1024;
const DEFAULT_UPDATE_DEBOUNCE_MS = 50;
const DEFAULT_PROMPT_SYMBOL_LIMIT = 15;
const DEFAULT_IMPACT_LIMIT = 6;

export class LspService implements SymbolContextProvider {
  private readonly rootPath: string;
  private readonly providers: LspProvider[];
  private readonly includeExtensions: string[];
  private readonly excludeDirs: string[];
  private readonly maxFileBytes: number;
  private readonly watch: boolean;
  private readonly updateDebounceMs: number;
  private readonly promptSymbolLimit: number;
  private readonly impactLimit: number;
  private readonly logger: Pick<Console, "info" | "warn" | "error" | "debug">;

  private readonly symbolGraph = new SymbolGraph();
  private readonly importGraph = new ImportGraph();
  private readonly knowledgeGraph = new LspCodeKnowledgeGraph(this.symbolGraph, this.importGraph);
  private readonly providerByExtension = new Map<string, LspProvider>();
  private readonly clients = new Map<string, LspClient>();
  private readonly disabledProviders = new Set<string>();
  private watcher: FSWatcher | null = null;
  private pendingFiles = new Map<string, boolean>();
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private flushing = false;
  private started = false;

  constructor(options: LspServiceOptions) {
    this.rootPath = path.resolve(options.rootPath);
    this.providers = options.providers ?? [createTypeScriptProvider()];
    this.includeExtensions =
      options.includeExtensions ??
      Array.from(
        new Set(
          this.providers.flatMap((provider) =>
            provider.extensions.map((ext) => `.${ext.toLowerCase()}`)
          )
        )
      );
    this.excludeDirs = options.excludeDirs ?? DEFAULT_EXCLUDE_DIRS;
    this.maxFileBytes = options.maxFileBytes ?? DEFAULT_MAX_FILE_BYTES;
    this.watch = options.watch ?? true;
    this.updateDebounceMs = options.updateDebounceMs ?? DEFAULT_UPDATE_DEBOUNCE_MS;
    this.promptSymbolLimit = options.promptSymbolLimit ?? DEFAULT_PROMPT_SYMBOL_LIMIT;
    this.impactLimit = options.impactLimit ?? DEFAULT_IMPACT_LIMIT;
    this.logger = options.logger ?? console;

    for (const provider of this.providers) {
      for (const ext of provider.extensions) {
        this.providerByExtension.set(ext.toLowerCase(), provider);
      }
    }
  }

  getSymbolGraph(): SymbolGraph {
    return this.symbolGraph;
  }

  getImportGraph(): ImportGraph {
    return this.importGraph;
  }

  getKnowledgeGraph(): LspCodeKnowledgeGraph {
    return this.knowledgeGraph;
  }

  async start(options: LspServiceStartOptions = {}): Promise<void> {
    if (this.started) {
      return;
    }
    this.started = true;

    if (this.watch) {
      await this.startWatching();
    }

    if (options.indexOnStart ?? true) {
      const indexPromise = this.indexProject();
      if (options.awaitInitialIndex) {
        await indexPromise;
      } else {
        void indexPromise;
      }
    }
  }

  async stop(): Promise<void> {
    if (this.watcher) {
      await this.watcher.close();
      this.watcher = null;
    }

    for (const client of this.clients.values()) {
      await client.stop();
    }
    this.clients.clear();
    this.started = false;
  }

  async indexProject(): Promise<SymbolIndexReport> {
    const start = performance.now();
    const files = await this.scanProjectFiles();
    const report: SymbolIndexReport = {
      totalFiles: files.length,
      indexedFiles: 0,
      skippedFiles: 0,
      durationMs: 0,
    };

    for (const file of files) {
      const indexed = await this.indexFile(file, { forceRefresh: false });
      if (indexed) {
        report.indexedFiles += 1;
      } else {
        report.skippedFiles += 1;
      }
    }

    report.durationMs = performance.now() - start;
    return report;
  }

  getSymbolContext(query: string, options: SymbolContextOptions = {}): string | undefined {
    const symbolLimit = options.limit ?? this.promptSymbolLimit;
    const symbolMatches = this.symbolGraph.query(query, { limit: symbolLimit });
    const symbolSection = this.formatSymbolMatches(symbolMatches);
    const impactSection = this.formatImpactSummary(query);

    if (!symbolSection && !impactSection) {
      return undefined;
    }

    const sections: string[] = [];
    if (symbolSection) {
      sections.push(`### Symbols\n${symbolSection}`);
    }
    if (impactSection) {
      sections.push(`### Impact Analysis\n${impactSection}`);
    }

    const combined = sections.join("\n\n");
    if (options.maxChars && combined.length > options.maxChars) {
      return combined.slice(0, options.maxChars);
    }
    return combined;
  }

  private async startWatching(): Promise<void> {
    if (this.watcher) {
      return;
    }

    const patterns = this.includeExtensions.map((ext) => `**/*${ext}`);
    const ignored = this.excludeDirs.map((dir) => `**/${dir}/**`);

    this.watcher = chokidar.watch(patterns, {
      cwd: this.rootPath,
      ignored,
      ignoreInitial: true,
    });

    this.watcher.on("add", (relative) => {
      this.scheduleIndexFile(path.join(this.rootPath, relative), false);
    });

    this.watcher.on("change", (relative) => {
      this.scheduleIndexFile(path.join(this.rootPath, relative), true);
    });

    this.watcher.on("unlink", (relative) => {
      const filePath = path.join(this.rootPath, relative);
      this.symbolGraph.removeFile(filePath);
      this.importGraph.removeFile(filePath);
    });

    await new Promise<void>((resolve) => {
      this.watcher?.on("ready", () => resolve());
    });
  }

  private scheduleIndexFile(filePath: string, forceRefresh: boolean): void {
    const normalized = path.resolve(filePath);
    const existing = this.pendingFiles.get(normalized);
    this.pendingFiles.set(normalized, existing ? existing || forceRefresh : forceRefresh);

    if (this.flushTimer) {
      return;
    }

    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      void this.flushPendingFiles();
    }, this.updateDebounceMs);
  }

  private async flushPendingFiles(): Promise<void> {
    if (this.flushing) {
      return;
    }
    this.flushing = true;

    const pending = Array.from(this.pendingFiles.entries());
    this.pendingFiles.clear();

    for (const [filePath, forceRefresh] of pending) {
      await this.indexFile(filePath, { forceRefresh });
    }

    this.flushing = false;
    if (this.pendingFiles.size > 0 && !this.flushTimer) {
      this.flushTimer = setTimeout(() => {
        this.flushTimer = null;
        void this.flushPendingFiles();
      }, this.updateDebounceMs);
    }
  }

  private async indexFile(filePath: string, options: { forceRefresh: boolean }): Promise<boolean> {
    const extension = path.extname(filePath).toLowerCase();
    if (!this.includeExtensions.includes(extension)) {
      return false;
    }

    const provider = this.resolveProvider(filePath);
    if (!provider) {
      await this.updateImportGraph(filePath);
      return false;
    }

    const client = await this.ensureClient(provider);
    if (!client) {
      await this.updateImportGraph(filePath);
      return false;
    }

    try {
      if (options.forceRefresh) {
        await client.closeDocument(filePath);
      }
      const symbols = await client.getDocumentSymbols(filePath);
      this.symbolGraph.updateFileSymbols(filePath, symbols);
      await this.updateImportGraph(filePath);
      return true;
    } catch (error) {
      this.logger.warn(`LSP indexing failed for ${filePath}:`, error);
      await this.updateImportGraph(filePath);
      return false;
    }
  }

  private resolveProvider(filePath: string): LspProvider | null {
    const ext = path.extname(filePath).slice(1).toLowerCase();
    return this.providerByExtension.get(ext) ?? null;
  }

  private async ensureClient(provider: LspProvider): Promise<LspClient | null> {
    if (this.disabledProviders.has(provider.id)) {
      return null;
    }
    const existing = this.clients.get(provider.id);
    if (existing) {
      return existing;
    }

    const client = new LspClient({ rootPath: this.rootPath, provider, logger: this.logger });
    try {
      await client.start();
      this.clients.set(provider.id, client);
      return client;
    } catch (error) {
      this.logger.warn(`Failed to start LSP provider ${provider.id}:`, error);
      this.disabledProviders.add(provider.id);
      return null;
    }
  }

  private async scanProjectFiles(): Promise<string[]> {
    const files: string[] = [];
    const exclude = new Set(this.excludeDirs);
    await this.walkDir(this.rootPath, files, exclude);
    return files;
  }

  private async walkDir(
    currentPath: string,
    files: string[],
    excludeDirs: Set<string>
  ): Promise<void> {
    let entries: import("node:fs").Dirent[];
    try {
      entries = await fs.readdir(currentPath, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const fullPath = path.join(currentPath, entry.name);
      if (entry.isDirectory()) {
        if (excludeDirs.has(entry.name)) {
          continue;
        }
        await this.walkDir(fullPath, files, excludeDirs);
        continue;
      }

      if (!entry.isFile()) {
        continue;
      }

      const extension = path.extname(entry.name).toLowerCase();
      if (!this.includeExtensions.includes(extension)) {
        continue;
      }

      let stats: Awaited<ReturnType<typeof fs.stat>>;
      try {
        stats = await fs.stat(fullPath);
      } catch {
        continue;
      }
      if (stats.size > this.maxFileBytes) {
        continue;
      }

      files.push(fullPath);
    }
  }

  private formatSymbolMatches(matches: SymbolQueryResult[]): string | undefined {
    if (matches.length === 0) {
      return undefined;
    }

    const lines: string[] = [];
    for (const match of matches) {
      const symbol = match.symbol;
      const location = this.formatLocation(symbol.file, symbol.line, symbol.column);
      const detail = symbol.detail ? ` - ${symbol.detail}` : "";
      const container = symbol.container ? ` (in ${symbol.container})` : "";
      lines.push(`- ${symbol.kind} ${symbol.name}${detail}${container} (${location})`);
    }
    return lines.join("\n");
  }

  private formatImpactSummary(query: string): string | undefined {
    const files = this.extractFilePaths(query);
    if (files.length === 0) {
      return undefined;
    }

    const lines: string[] = [];
    for (const filePath of files) {
      const dependents = this.importGraph.getDependents(filePath);
      if (dependents.length === 0) {
        continue;
      }
      const relative = this.formatRelativePath(filePath);
      const sample = dependents
        .slice(0, this.impactLimit)
        .map((dep) => this.formatRelativePath(dep))
        .join(", ");
      const extra =
        dependents.length > this.impactLimit
          ? ` +${dependents.length - this.impactLimit} more`
          : "";
      lines.push(`- ${relative}: affects ${dependents.length} file(s) -> ${sample}${extra}`);
    }

    return lines.length > 0 ? lines.join("\n") : undefined;
  }

  private extractFilePaths(query: string): string[] {
    const extensions = this.includeExtensions.map((ext) => ext.replace(".", ""));
    const pattern = new RegExp(`[\\w@./-]+\\.(${extensions.join("|")})`, "gi");
    const matches = query.match(pattern);
    if (!matches) {
      return [];
    }

    const results: string[] = [];
    for (const match of matches) {
      const cleaned = match.replace(/[),.;:]+$/, "");
      const absolute = path.isAbsolute(cleaned) ? cleaned : path.resolve(this.rootPath, cleaned);
      results.push(absolute);
    }
    return Array.from(new Set(results));
  }

  private formatLocation(filePath: string, line: number, column: number): string {
    const relative = this.formatRelativePath(filePath);
    return `${relative}:${line}:${column}`;
  }

  private formatRelativePath(filePath: string): string {
    const relative = path.relative(this.rootPath, filePath);
    if (!relative || relative.startsWith("..")) {
      return filePath;
    }
    return relative;
  }

  private async updateImportGraph(filePath: string): Promise<void> {
    let content: string;
    try {
      content = await fs.readFile(filePath, "utf8");
    } catch {
      return;
    }
    const imports = this.extractImports(content, filePath);
    this.importGraph.updateFileImports(filePath, imports);
  }

  private extractImports(content: string, filePath: string): string[] {
    const imports = new Set<string>();
    const importExportRegex =
      /\b(?:import|export)\s+(?:type\s+)?(?:[^"'`]*from\s+)?["'`]([^"'`]+)["'`]/g;
    const requireRegex = /\brequire\s*\(\s*["'`]([^"'`]+)["'`]\s*\)/g;
    const dynamicImportRegex = /\bimport\s*\(\s*["'`]([^"'`]+)["'`]\s*\)/g;

    for (const match of content.matchAll(importExportRegex)) {
      if (match[1]) {
        imports.add(match[1]);
      }
    }
    for (const match of content.matchAll(requireRegex)) {
      if (match[1]) {
        imports.add(match[1]);
      }
    }
    for (const match of content.matchAll(dynamicImportRegex)) {
      if (match[1]) {
        imports.add(match[1]);
      }
    }

    const resolved: string[] = [];
    for (const specifier of imports) {
      const resolvedPath = this.resolveImportTarget(filePath, specifier);
      if (resolvedPath) {
        resolved.push(resolvedPath);
      }
    }

    return resolved;
  }

  private resolveImportTarget(filePath: string, specifier: string): string | null {
    if (!specifier.startsWith(".")) {
      return null;
    }

    const base = path.resolve(path.dirname(filePath), specifier);
    const extension = path.extname(base);
    if (extension) {
      return existsSync(base) ? path.resolve(base) : null;
    }

    const candidates = this.includeExtensions.map((ext) => `${base}${ext}`);
    candidates.push(...this.includeExtensions.map((ext) => path.join(base, `index${ext}`)));

    for (const candidate of candidates) {
      if (existsSync(candidate)) {
        return path.resolve(candidate);
      }
    }

    return null;
  }
}
