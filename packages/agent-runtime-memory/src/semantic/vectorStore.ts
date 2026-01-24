import { VectorIndex } from "../vectorIndex";

export interface EmbeddingProvider {
  embed(text: string): Promise<number[]>;
  dimension: number;
}

export interface VectorStoreEntry {
  id: string;
  content: string;
  embedding?: number[];
  metadata?: Record<string, unknown>;
}

export interface VectorSearchOptions {
  limit?: number;
  threshold?: number;
}

export interface VectorSearchResult<T extends VectorStoreEntry> {
  entry: T;
  score: number;
}

export interface VectorStore<T extends VectorStoreEntry> {
  upsert(entry: T): Promise<void>;
  delete(id: string): Promise<void>;
  search(query: string, options?: VectorSearchOptions): Promise<VectorSearchResult<T>[]>;
  searchByEmbedding(
    embedding: number[],
    options?: VectorSearchOptions
  ): Promise<VectorSearchResult<T>[]>;
}

export interface InMemoryVectorStoreConfig {
  dimension: number;
  maxEntries?: number;
  embeddingProvider?: EmbeddingProvider;
}

export class InMemoryVectorStore<T extends VectorStoreEntry> implements VectorStore<T> {
  private readonly index: VectorIndex;
  private readonly entries = new Map<string, T>();
  private readonly embeddingProvider?: EmbeddingProvider;

  constructor(config: InMemoryVectorStoreConfig) {
    this.index = new VectorIndex({ dimension: config.dimension, maxEntries: config.maxEntries });
    this.embeddingProvider = config.embeddingProvider;
  }

  async upsert(entry: T): Promise<void> {
    const embedding = entry.embedding ?? (await this.embedIfNeeded(entry.content));
    if (!embedding) {
      throw new Error("Embedding is required to upsert into vector store");
    }

    const updated: T = { ...entry, embedding };
    this.entries.set(entry.id, updated);
    this.index.add(entry.id, embedding, updated.metadata);
  }

  async delete(id: string): Promise<void> {
    this.entries.delete(id);
    this.index.remove(id);
  }

  async search(query: string, options?: VectorSearchOptions): Promise<VectorSearchResult<T>[]> {
    const embedding = await this.embedIfNeeded(query);
    if (!embedding) {
      return this.searchByText(query, options);
    }
    return this.searchByEmbedding(embedding, options);
  }

  async searchByEmbedding(
    embedding: number[],
    options?: VectorSearchOptions
  ): Promise<VectorSearchResult<T>[]> {
    const results = this.index.search(embedding, {
      limit: options?.limit,
      threshold: options?.threshold,
    });

    return results
      .map((result) => {
        const entry = this.entries.get(result.id);
        return entry ? { entry, score: result.score } : undefined;
      })
      .filter((result): result is VectorSearchResult<T> => Boolean(result));
  }

  private async embedIfNeeded(text: string): Promise<number[] | undefined> {
    if (!this.embeddingProvider) {
      return undefined;
    }
    return this.embeddingProvider.embed(text);
  }

  private async searchByText(
    query: string,
    options?: VectorSearchOptions
  ): Promise<VectorSearchResult<T>[]> {
    const normalized = query.toLowerCase();
    const scored: Array<VectorSearchResult<T>> = [];

    for (const entry of this.entries.values()) {
      const score = textScore(entry.content, normalized);
      if (score > 0) {
        scored.push({ entry, score });
      }
    }

    scored.sort((a, b) => b.score - a.score);
    const limit = options?.limit ?? scored.length;
    return scored.slice(0, limit);
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

export type { SqliteVectorStoreConfig } from "./sqliteVectorStore";
export { SqliteVectorStore } from "./sqliteVectorStore";
