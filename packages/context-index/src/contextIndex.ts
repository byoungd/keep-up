import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { cosineSimilarity as nativeCosineSimilarity } from "@ku0/vector-similarity-rs";
import { chunkText } from "./chunker";
import { createHashEmbeddingProvider, type EmbeddingProvider } from "./embedding";
import { scanProjectFiles } from "./scanner";
import type {
  ContextChunk,
  ContextIndexConfig,
  ContextIndexReport,
  ContextIndexStore,
  ContextPack,
  ContextPackPin,
  ContextPackPromptOptions,
  ContextSearchOptions,
  ContextSearchResult,
  ContextSource,
} from "./types";

export interface ContextIndexOptions extends Partial<ContextIndexConfig> {
  rootPath: string;
  store: ContextIndexStore;
  embeddingProvider?: EmbeddingProvider;
}

const DEFAULT_CONFIG: Required<Omit<ContextIndexConfig, "rootPath">> = {
  includeExtensions: [
    ".ts",
    ".tsx",
    ".js",
    ".jsx",
    ".json",
    ".md",
    ".mdx",
    ".txt",
    ".css",
    ".scss",
    ".html",
    ".yml",
    ".yaml",
    ".toml",
    ".go",
    ".rs",
    ".py",
    ".java",
    ".kt",
    ".swift",
    ".rb",
    ".php",
    ".c",
    ".cpp",
    ".h",
    ".hpp",
  ],
  excludeDirs: [
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
  ],
  maxFileBytes: 512 * 1024,
  maxChunkTokens: 400,
  chunkOverlapTokens: 40,
  tokenModel: "cl100k_base",
  respectGitignore: true,
  promptTokenBudget: 1500,
  minSearchScore: 0.15,
  reindexIntervalMs: 60_000,
};

export class ContextIndex {
  private readonly store: ContextIndexStore;
  private readonly embeddingProvider: EmbeddingProvider;
  private config: Required<ContextIndexConfig>;
  private indexingPromise: Promise<ContextIndexReport> | null = null;
  private lastIndexedAt: number | null = null;

  constructor(options: ContextIndexOptions) {
    const { rootPath, store, embeddingProvider, ...config } = options;
    const resolvedConfig = {
      ...DEFAULT_CONFIG,
      ...config,
      rootPath,
    } satisfies Required<ContextIndexConfig>;

    this.store = store;
    this.config = resolvedConfig;
    this.embeddingProvider = embeddingProvider ?? createHashEmbeddingProvider();
  }

  updateConfig(patch: Partial<Omit<ContextIndexConfig, "rootPath">>): void {
    if (Object.keys(patch).length === 0) {
      return;
    }

    const nextConfig = { ...this.config, ...patch };
    const shouldReindex =
      nextConfig.maxFileBytes !== this.config.maxFileBytes ||
      nextConfig.maxChunkTokens !== this.config.maxChunkTokens ||
      nextConfig.chunkOverlapTokens !== this.config.chunkOverlapTokens ||
      nextConfig.tokenModel !== this.config.tokenModel ||
      nextConfig.respectGitignore !== this.config.respectGitignore ||
      !arraysEqual(nextConfig.includeExtensions, this.config.includeExtensions) ||
      !arraysEqual(nextConfig.excludeDirs, this.config.excludeDirs);

    this.config = nextConfig;
    if (shouldReindex) {
      this.lastIndexedAt = null;
    }
  }

  async indexProject(): Promise<ContextIndexReport> {
    const report: ContextIndexReport = {
      totalFiles: 0,
      updatedFiles: 0,
      skippedFiles: 0,
      removedFiles: 0,
      chunkCount: 0,
    };

    const files = await scanProjectFiles(this.config.rootPath, {
      includeExtensions: this.config.includeExtensions,
      excludeDirs: this.config.excludeDirs,
      maxFileBytes: this.config.maxFileBytes,
      respectGitignore: this.config.respectGitignore,
    });

    report.totalFiles = files.length;
    const sourceMap = new Map(
      (await this.store.listSources()).map((source) => [source.sourcePath, source])
    );
    const fileSet = new Set(files.map(normalizePath));

    for (const relativePath of files) {
      const sourcePath = normalizePath(relativePath);
      const existing = sourceMap.get(sourcePath);

      try {
        const absolutePath = join(this.config.rootPath, relativePath);
        const content = await readFile(absolutePath, "utf-8");
        if (isBinaryContent(content)) {
          report.skippedFiles += 1;
          continue;
        }

        const contentHash = hashContent(content);
        if (existing && existing.contentHash === contentHash) {
          report.skippedFiles += 1;
          continue;
        }

        await this.store.deleteChunksBySource(sourcePath);

        const chunks = chunkText(content, {
          maxTokens: this.config.maxChunkTokens,
          overlapTokens: this.config.chunkOverlapTokens,
          tokenModel: this.config.tokenModel,
        });
        const embeddings = await this.embeddingProvider.embed(chunks.map((chunk) => chunk.content));
        const chunkIds: string[] = [];
        const now = Date.now();

        for (let i = 0; i < chunks.length; i += 1) {
          const chunk = chunks[i];
          const embedding = embeddings[i] ?? [];
          const chunkHash = hashContent(chunk.content);
          const chunkId = createChunkId(sourcePath, i, chunkHash);
          const record: ContextChunk = {
            id: chunkId,
            sourcePath,
            content: chunk.content,
            tokenCount: chunk.tokenCount,
            embedding,
            updatedAt: now,
          };
          await this.store.upsertChunk(record);
          chunkIds.push(chunkId);
        }

        const source: ContextSource = {
          sourcePath,
          contentHash,
          tokenCount: chunks.reduce((sum, chunk) => sum + chunk.tokenCount, 0),
          chunkIds,
          updatedAt: now,
        };
        await this.store.upsertSource(source);
        report.updatedFiles += 1;
        report.chunkCount += chunkIds.length;
      } catch {
        report.skippedFiles += 1;
      }
    }

    for (const source of sourceMap.values()) {
      if (!fileSet.has(source.sourcePath)) {
        await this.store.deleteChunksBySource(source.sourcePath);
        await this.store.deleteSource(source.sourcePath);
        report.removedFiles += 1;
      }
    }

    return report;
  }

  async search(query: string, options: ContextSearchOptions = {}): Promise<ContextSearchResult[]> {
    const trimmed = query.trim();
    if (!trimmed) {
      return [];
    }

    await this.ensureIndex();
    const [queryEmbedding] = await this.embeddingProvider.embed([trimmed]);
    const chunks = await this.store.listChunks();
    const minScore = options.minScore ?? this.config.minSearchScore;
    const limit = options.limit ?? 10;

    const scored = chunks
      .map((chunk) => ({
        chunk,
        score: cosineSimilarity(queryEmbedding ?? [], chunk.embedding),
      }))
      .filter((result) => result.score >= minScore)
      .sort((a, b) => {
        if (b.score !== a.score) {
          return b.score - a.score;
        }
        if (a.chunk.sourcePath !== b.chunk.sourcePath) {
          return a.chunk.sourcePath.localeCompare(b.chunk.sourcePath);
        }
        return a.chunk.id.localeCompare(b.chunk.id);
      });

    return scored.slice(0, limit);
  }

  async listPacks(): Promise<ContextPack[]> {
    return this.store.listPacks();
  }

  async getPack(packId: string): Promise<ContextPack | null> {
    return this.store.getPack(packId);
  }

  async createPack(name: string, chunkIds: string[]): Promise<ContextPack> {
    const now = Date.now();
    const pack: ContextPack = {
      id: crypto.randomUUID(),
      name,
      chunkIds: uniqueValues(chunkIds),
      createdAt: now,
      updatedAt: now,
    };
    return this.store.upsertPack(pack);
  }

  async updatePack(
    packId: string,
    update: { name?: string; chunkIds?: string[] }
  ): Promise<ContextPack | null> {
    const existing = await this.store.getPack(packId);
    if (!existing) {
      return null;
    }
    const next: ContextPack = {
      ...existing,
      name: update.name ?? existing.name,
      chunkIds: update.chunkIds ? uniqueValues(update.chunkIds) : existing.chunkIds,
      updatedAt: Date.now(),
    };
    return this.store.upsertPack(next);
  }

  async deletePack(packId: string): Promise<boolean> {
    const deleted = await this.store.deletePack(packId);
    if (deleted) {
      await this.removePackFromPins(packId);
    }
    return deleted;
  }

  async getPins(sessionId: string): Promise<ContextPackPin | null> {
    return this.store.getPins(sessionId);
  }

  async setPins(sessionId: string, packIds: string[]): Promise<ContextPackPin | null> {
    const unique = uniqueValues(packIds);
    if (unique.length === 0) {
      await this.store.deletePins(sessionId);
      return null;
    }
    const pins: ContextPackPin = {
      sessionId,
      packIds: unique,
      updatedAt: Date.now(),
    };
    return this.store.upsertPins(pins);
  }

  async buildPackPrompt(
    packIds: string[],
    options: ContextPackPromptOptions = {}
  ): Promise<string | undefined> {
    if (packIds.length === 0) {
      return undefined;
    }

    await this.ensureIndex();
    const tokenBudget = options.tokenBudget ?? this.config.promptTokenBudget;
    const state: PromptState = {
      remaining: tokenBudget,
      lines: ["<context_packs>"],
      chunkCount: 0,
    };

    for (const packId of packIds) {
      if (!this.hasBudget(state)) {
        break;
      }
      await this.appendPackPrompt(state, packId);
    }

    state.lines.push("</context_packs>");

    if (state.chunkCount === 0) {
      return undefined;
    }

    return state.lines.join("\n");
  }

  private async ensureIndex(): Promise<void> {
    const now = Date.now();
    const shouldIndex =
      this.lastIndexedAt === null || now - this.lastIndexedAt > this.config.reindexIntervalMs;

    if (!shouldIndex) {
      return;
    }

    if (!this.indexingPromise) {
      this.indexingPromise = this.indexProject()
        .then((report) => {
          this.lastIndexedAt = Date.now();
          return report;
        })
        .finally(() => {
          this.indexingPromise = null;
        });
    }

    await this.indexingPromise;
  }

  private async removePackFromPins(packId: string): Promise<void> {
    const pins = await this.store.listPins();
    for (const entry of pins) {
      if (!entry.packIds.includes(packId)) {
        continue;
      }
      const nextIds = entry.packIds.filter((id) => id !== packId);
      if (nextIds.length === 0) {
        await this.store.deletePins(entry.sessionId);
      } else {
        await this.store.upsertPins({
          ...entry,
          packIds: nextIds,
          updatedAt: Date.now(),
        });
      }
    }
  }

  private hasBudget(state: PromptState): boolean {
    return state.remaining > 0;
  }

  private async appendPackPrompt(state: PromptState, packId: string): Promise<void> {
    const pack = await this.store.getPack(packId);
    if (!pack) {
      return;
    }

    state.lines.push(`<context_pack id="${pack.id}" name="${escapeAttribute(pack.name)}">`);
    await this.appendPackChunks(state, pack.chunkIds);
    state.lines.push("</context_pack>");
  }

  private async appendPackChunks(state: PromptState, chunkIds: string[]): Promise<void> {
    for (const chunkId of chunkIds) {
      const chunk = await this.store.getChunk(chunkId);
      if (!chunk) {
        continue;
      }
      if (!this.canFitChunk(state, chunk.tokenCount)) {
        break;
      }
      this.appendChunk(state, chunk);
      if (!this.hasBudget(state)) {
        break;
      }
    }
  }

  private canFitChunk(state: PromptState, tokenCount: number): boolean {
    return state.remaining - tokenCount >= 0;
  }

  private appendChunk(state: PromptState, chunk: ContextChunk): void {
    state.remaining -= chunk.tokenCount;
    state.chunkCount += 1;
    state.lines.push(`<chunk source="${escapeAttribute(chunk.sourcePath)}">`);
    state.lines.push(chunk.content);
    state.lines.push("</chunk>");
  }
}

export function createContextIndex(options: ContextIndexOptions): ContextIndex {
  return new ContextIndex(options);
}

function arraysEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) {
    return false;
  }
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) {
      return false;
    }
  }
  return true;
}

function hashContent(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

function createChunkId(sourcePath: string, index: number, chunkHash: string): string {
  const hash = createHash("sha256")
    .update(sourcePath)
    .update(":")
    .update(String(index))
    .update(":")
    .update(chunkHash)
    .digest("hex");
  return `chunk_${hash.slice(0, 20)}`;
}

function uniqueValues(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    if (!seen.has(value)) {
      seen.add(value);
      result.push(value);
    }
  }
  return result;
}

type PromptState = {
  remaining: number;
  lines: string[];
  chunkCount: number;
};

function isBinaryContent(content: string): boolean {
  return content.includes("\u0000");
}

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length === b.length) {
    return nativeCosineSimilarity(a, b);
  }

  const length = Math.min(a.length, b.length);
  if (length === 0) {
    return 0;
  }

  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < length; i += 1) {
    const va = a[i] ?? 0;
    const vb = b[i] ?? 0;
    dot += va * vb;
    normA += va * va;
    normB += vb * vb;
  }

  if (normA === 0 || normB === 0) {
    return 0;
  }

  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

function normalizePath(path: string): string {
  return path.replace(/\\/g, "/");
}

function escapeAttribute(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}
