import { createRequire } from "node:module";
import type { Database as DatabaseInstance } from "better-sqlite3";
import { cosineSimilarity } from "../types";
import type {
  EmbeddingProvider,
  VectorSearchOptions,
  VectorSearchResult,
  VectorStore,
  VectorStoreEntry,
} from "./vectorStore";

export type SqliteVectorStoreExtension = {
  name?: string;
  load: (db: DatabaseInstance) => void;
};

export type SqliteVectorStoreConfig = {
  filePath: string;
  tableName?: string;
  dimension: number;
  maxEntries?: number;
  embeddingProvider?: EmbeddingProvider;
  enableWal?: boolean;
  extensions?: SqliteVectorStoreExtension[];
  ignoreExtensionErrors?: boolean;
  enableVecSearch?: boolean;
  vecTableName?: string;
  vecDistanceMetric?: "cosine" | "l2";
};

type SqliteRow = {
  id: string;
  content: string;
  embedding: Buffer;
  metadata: string | null;
  created_at: number;
};

const DEFAULT_TABLE = "vector_entries";

type DatabaseConstructor = new (filePath: string) => DatabaseInstance;

let cachedDatabaseConstructor: DatabaseConstructor | null = null;

function loadDatabaseConstructor(): DatabaseConstructor {
  if (cachedDatabaseConstructor) {
    return cachedDatabaseConstructor;
  }
  const require = createRequire(import.meta.url);
  let loaded: unknown;
  try {
    loaded = require("better-sqlite3");
  } catch (error) {
    const message =
      "better-sqlite3 is required to use SqliteVectorStore. Install dependencies or disable sqlite-backed memory stores.";
    throw new Error(message, { cause: error });
  }
  const Database = (loaded as { default?: DatabaseConstructor }).default ?? loaded;
  if (typeof Database !== "function") {
    throw new Error("Failed to load better-sqlite3 constructor.");
  }
  cachedDatabaseConstructor = Database as DatabaseConstructor;
  return cachedDatabaseConstructor;
}

export class SqliteVectorStore<T extends VectorStoreEntry> implements VectorStore<T> {
  private readonly db: DatabaseInstance;
  private readonly tableName: string;
  private readonly vecTableName?: string;
  private readonly dimension: number;
  private readonly maxEntries?: number;
  private readonly embeddingProvider?: EmbeddingProvider;
  private readonly vecDistanceMetric: "cosine" | "l2";
  private readonly ignoreExtensionErrors: boolean;
  private vecEnabled = false;

  constructor(config: SqliteVectorStoreConfig) {
    this.tableName = normalizeIdentifier(config.tableName ?? DEFAULT_TABLE);
    this.dimension = config.dimension;
    this.maxEntries = config.maxEntries;
    this.embeddingProvider = config.embeddingProvider;
    this.vecTableName = config.vecTableName
      ? normalizeIdentifier(config.vecTableName)
      : `${this.tableName}_vec`;
    this.vecDistanceMetric = config.vecDistanceMetric ?? "cosine";
    this.ignoreExtensionErrors = config.ignoreExtensionErrors ?? false;
    const Database = loadDatabaseConstructor();
    this.db = new Database(config.filePath);

    this.loadExtensions(config.extensions, this.ignoreExtensionErrors);

    if (config.enableWal ?? true) {
      this.db.pragma("journal_mode = WAL");
    }

    this.initializeSchema();
    if (config.enableVecSearch) {
      this.initializeVecSchema();
    }
  }

  async upsert(entry: T): Promise<void> {
    const embedding = entry.embedding ?? (await this.embedIfNeeded(entry.content));
    if (!embedding) {
      throw new Error("Embedding is required to upsert into vector store");
    }
    this.assertDimension(embedding);

    const serialized = serializeEmbedding(embedding);
    const metadata = entry.metadata ? JSON.stringify(entry.metadata) : null;
    const now = Date.now();

    this.db
      .prepare(
        `INSERT INTO ${this.tableName} (id, content, embedding, metadata, created_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           content = excluded.content,
           embedding = excluded.embedding,
           metadata = excluded.metadata,
           created_at = excluded.created_at`
      )
      .run(entry.id, entry.content, serialized, metadata, now);

    if (this.vecEnabled) {
      this.upsertVecEntry(entry.id, embedding);
    }

    this.evictIfNeeded();
  }

  async delete(id: string): Promise<void> {
    this.db.prepare(`DELETE FROM ${this.tableName} WHERE id = ?`).run(id);
    if (this.vecEnabled) {
      this.deleteVecEntry(id);
    }
  }

  async search(query: string, options?: VectorSearchOptions): Promise<VectorSearchResult<T>[]> {
    const embedding = await this.embedIfNeeded(query);
    if (embedding) {
      return this.searchByEmbedding(embedding, options);
    }
    return this.searchByText(query, options);
  }

  async searchByEmbedding(
    embedding: number[],
    options?: VectorSearchOptions
  ): Promise<VectorSearchResult<T>[]> {
    this.assertDimension(embedding);
    if (this.vecEnabled) {
      const vecResults = this.searchByEmbeddingVec(embedding, options);
      if (vecResults) {
        return vecResults;
      }
    }

    return this.searchByEmbeddingFallback(embedding, options);
  }

  close(): void {
    this.db.close();
  }

  private initializeSchema(): void {
    this.db.exec(
      `CREATE TABLE IF NOT EXISTS ${this.tableName} (
        id TEXT PRIMARY KEY,
        content TEXT NOT NULL,
        embedding BLOB NOT NULL,
        metadata TEXT,
        created_at INTEGER NOT NULL
      );`
    );
  }

  private initializeVecSchema(): void {
    if (!this.vecTableName) {
      return;
    }

    try {
      this.db.exec(
        `CREATE VIRTUAL TABLE IF NOT EXISTS ${this.vecTableName}
         USING vec0(embedding float[${this.dimension}], id TEXT);`
      );
      this.vecEnabled = true;
    } catch (error) {
      if (this.ignoreExtensionErrors) {
        this.vecEnabled = false;
        return;
      }
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to initialize sqlite-vec table: ${message}`);
    }
  }

  private loadExtensions(
    extensions: SqliteVectorStoreExtension[] | undefined,
    ignoreErrors: boolean
  ): void {
    if (!extensions || extensions.length === 0) {
      return;
    }

    for (const extension of extensions) {
      try {
        extension.load(this.db);
      } catch (error) {
        if (ignoreErrors) {
          continue;
        }
        const label = extension.name ? ` (${extension.name})` : "";
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`Failed to load sqlite vector extension${label}: ${message}`);
      }
    }
  }

  private evictIfNeeded(): void {
    if (!this.maxEntries) {
      return;
    }
    const row = this.db.prepare(`SELECT COUNT(1) as count FROM ${this.tableName}`).get() as {
      count: number;
    };
    if (row.count <= this.maxEntries) {
      return;
    }
    const overage = row.count - this.maxEntries;
    this.db
      .prepare(
        `DELETE FROM ${this.tableName}
         WHERE id IN (
           SELECT id FROM ${this.tableName}
           ORDER BY created_at ASC
           LIMIT ?
         )`
      )
      .run(overage);
  }

  private async embedIfNeeded(text: string): Promise<number[] | undefined> {
    if (!this.embeddingProvider) {
      return undefined;
    }
    return this.embeddingProvider.embed(text);
  }

  private searchByEmbeddingFallback(
    embedding: number[],
    options?: VectorSearchOptions
  ): VectorSearchResult<T>[] {
    const rows = this.db
      .prepare(`SELECT id, content, embedding, metadata, created_at FROM ${this.tableName}`)
      .all() as SqliteRow[];
    const threshold = options?.threshold ?? 0;
    const limit = options?.limit ?? rows.length;

    const results: VectorSearchResult<T>[] = [];
    for (const row of rows) {
      const candidateEmbedding = deserializeEmbedding(row.embedding);
      const score = cosineSimilarity(embedding, candidateEmbedding);
      if (score < threshold) {
        continue;
      }
      results.push({
        entry: this.fromRow(row, candidateEmbedding),
        score,
      });
    }

    results.sort((a, b) => b.score - a.score);
    return results.slice(0, limit);
  }

  private searchByEmbeddingVec(
    embedding: number[],
    options?: VectorSearchOptions
  ): VectorSearchResult<T>[] | null {
    if (!this.vecTableName || !this.vecEnabled) {
      return null;
    }

    const limit = options?.limit ?? 10;
    const threshold = options?.threshold ?? 0;
    const queryVector = JSON.stringify(embedding);
    const vecLimit = limit * 3;

    try {
      const rows = this.db
        .prepare(
          `SELECT id, distance FROM ${this.vecTableName}
           WHERE embedding MATCH ?
           ORDER BY distance
           LIMIT ?`
        )
        .all(queryVector, vecLimit) as Array<{ id: string; distance: number }>;

      if (rows.length === 0) {
        return [];
      }

      const ids = rows.map((row) => row.id);
      const placeholders = ids.map(() => "?").join(", ");
      const entries = this.db
        .prepare(
          `SELECT id, content, embedding, metadata, created_at
           FROM ${this.tableName}
           WHERE id IN (${placeholders})`
        )
        .all(...ids) as SqliteRow[];
      const entryMap = new Map(entries.map((row) => [row.id, row]));

      const results: VectorSearchResult<T>[] = [];
      for (const row of rows) {
        const entryRow = entryMap.get(row.id);
        if (!entryRow) {
          continue;
        }
        const score = distanceToScore(row.distance, this.vecDistanceMetric);
        if (score < threshold) {
          continue;
        }
        results.push({
          entry: this.fromRow(entryRow, deserializeEmbedding(entryRow.embedding)),
          score,
        });
        if (results.length >= limit) {
          break;
        }
      }

      return results;
    } catch (error) {
      if (!this.ignoreExtensionErrors) {
        throw error;
      }
      this.vecEnabled = false;
      return null;
    }
  }

  private upsertVecEntry(id: string, embedding: number[]): void {
    if (!this.vecTableName || !this.vecEnabled) {
      return;
    }

    try {
      this.db.prepare(`DELETE FROM ${this.vecTableName} WHERE id = ?`).run(id);
      this.db
        .prepare(`INSERT INTO ${this.vecTableName} (embedding, id) VALUES (?, ?)`)
        .run(JSON.stringify(embedding), id);
    } catch (error) {
      if (!this.ignoreExtensionErrors) {
        throw error;
      }
      this.vecEnabled = false;
    }
  }

  private deleteVecEntry(id: string): void {
    if (!this.vecTableName || !this.vecEnabled) {
      return;
    }
    try {
      this.db.prepare(`DELETE FROM ${this.vecTableName} WHERE id = ?`).run(id);
    } catch (error) {
      if (!this.ignoreExtensionErrors) {
        throw error;
      }
      this.vecEnabled = false;
    }
  }

  private searchByText(query: string, options?: VectorSearchOptions): VectorSearchResult<T>[] {
    const rows = this.db
      .prepare(`SELECT id, content, embedding, metadata, created_at FROM ${this.tableName}`)
      .all() as SqliteRow[];
    const normalized = query.toLowerCase();
    const threshold = options?.threshold ?? 0;
    const limit = options?.limit ?? rows.length;

    const scored: VectorSearchResult<T>[] = [];
    for (const row of rows) {
      const score = textScore(row.content, normalized);
      if (score < threshold) {
        continue;
      }
      scored.push({
        entry: this.fromRow(row, deserializeEmbedding(row.embedding)),
        score,
      });
    }

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, limit);
  }

  private fromRow(row: SqliteRow, embedding: number[]): T {
    return {
      id: row.id,
      content: row.content,
      embedding,
      metadata: row.metadata ? safeParseMetadata(row.metadata) : undefined,
    } as T;
  }

  private assertDimension(embedding: number[]): void {
    if (embedding.length !== this.dimension) {
      throw new Error(
        `Embedding dimension mismatch: expected ${this.dimension}, got ${embedding.length}`
      );
    }
  }
}

function normalizeIdentifier(value: string): string {
  if (!/^[A-Za-z0-9_]+$/.test(value)) {
    throw new Error(`Invalid sqlite identifier: ${value}`);
  }
  return value;
}

function serializeEmbedding(embedding: number[]): Buffer {
  const array = Float32Array.from(embedding);
  return Buffer.from(array.buffer);
}

function deserializeEmbedding(buffer: Buffer): number[] {
  const view = new Float32Array(buffer.buffer, buffer.byteOffset, buffer.byteLength / 4);
  return Array.from(view);
}

function safeParseMetadata(raw: string): Record<string, unknown> | undefined {
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return parsed ?? undefined;
  } catch {
    return undefined;
  }
}

function textScore(content: string, query: string): number {
  const normalized = content.toLowerCase();
  if (normalized === query) {
    return 1;
  }
  if (normalized.includes(query)) {
    return Math.min(0.9, query.length / normalized.length + 0.3);
  }
  return 0;
}

function distanceToScore(distance: number, metric: "cosine" | "l2"): number {
  if (!Number.isFinite(distance)) {
    return Number.NEGATIVE_INFINITY;
  }
  if (metric === "cosine") {
    return 1 - distance;
  }
  return 1 / (1 + distance);
}
