/**
 * Embedding Service
 *
 * Generates embeddings for text chunks using the AI Gateway.
 * Supports batching, caching, and multiple embedding models.
 */

import type { AIGateway } from "../gateway";
import type { DocumentChunk } from "./types";

/** Embedding with metadata */
export interface ChunkEmbedding {
  /** Chunk ID */
  chunkId: string;
  /** Document ID */
  docId: string;
  /** Embedding vector */
  embedding: number[];
  /** Model used */
  model: string;
  /** Dimensions */
  dimensions: number;
  /** Created timestamp */
  createdAt: number;
}

/** Embedding cache entry */
interface CacheEntry {
  embedding: number[];
  model: string;
  expiresAt: number;
}

/** Embedding service options */
export interface EmbeddingServiceConfig {
  /** Default embedding model */
  model?: string;
  /** Embedding dimensions (if model supports) */
  dimensions?: number;
  /** Batch size for embedding requests */
  batchSize?: number;
  /** Cache TTL in ms (0 to disable) */
  cacheTtlMs?: number;
  /** Maximum cache size */
  maxCacheSize?: number;
}

/** Default configuration */
const DEFAULT_CONFIG: Required<EmbeddingServiceConfig> = {
  model: "text-embedding-3-small",
  dimensions: 1536,
  batchSize: 100,
  cacheTtlMs: 3600000, // 1 hour
  maxCacheSize: 10000,
};

/**
 * Embedding Service
 *
 * Generates and caches embeddings for document chunks.
 */
export class EmbeddingService {
  private readonly config: Required<EmbeddingServiceConfig>;
  private readonly gateway: AIGateway;
  private readonly cache: Map<string, CacheEntry> = new Map();

  constructor(gateway: AIGateway, config: EmbeddingServiceConfig = {}) {
    this.gateway = gateway;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Generate embeddings for document chunks.
   */
  async embedChunks(
    chunks: DocumentChunk[],
    userId: string,
    options: { model?: string; skipCache?: boolean } = {}
  ): Promise<ChunkEmbedding[]> {
    const model = options.model ?? this.config.model;
    const { cachedResults, toEmbed } = this.collectCachedEmbeddings(
      chunks,
      model,
      options.skipCache === true
    );
    const embedded = await this.embedUncachedChunks(
      toEmbed,
      userId,
      model,
      options.skipCache === true
    );
    return this.sortResultsByInput([...cachedResults, ...embedded], chunks);
  }

  /**
   * Generate embedding for a single text.
   */
  async embedText(
    text: string,
    userId: string,
    options: { model?: string } = {}
  ): Promise<number[]> {
    const model = options.model ?? this.config.model;

    // Check cache
    const cacheKey = this.hashText(text);
    const cached = this.getFromCache(cacheKey, model);
    if (cached) {
      return cached.embedding;
    }

    // Generate embedding
    const response = await this.gateway.embed([text], {
      userId,
      model,
      dimensions: this.config.dimensions,
    });

    const embedding = response.embeddings[0];
    if (embedding) {
      this.addToCache(cacheKey, model, embedding);
    }

    return embedding || [];
  }

  private collectCachedEmbeddings(
    chunks: DocumentChunk[],
    model: string,
    skipCache: boolean
  ): {
    cachedResults: ChunkEmbedding[];
    toEmbed: Array<{ chunk: DocumentChunk; index: number }>;
  } {
    const cachedResults: ChunkEmbedding[] = [];
    const toEmbed: Array<{ chunk: DocumentChunk; index: number }> = [];

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      if (skipCache) {
        toEmbed.push({ chunk, index: i });
        continue;
      }

      const cached = this.getFromCache(chunk.id, model);
      if (cached) {
        cachedResults.push(this.toChunkEmbedding(chunk, cached.embedding, cached.model));
      } else {
        toEmbed.push({ chunk, index: i });
      }
    }

    return { cachedResults, toEmbed };
  }

  private async embedUncachedChunks(
    toEmbed: Array<{ chunk: DocumentChunk; index: number }>,
    userId: string,
    model: string,
    skipCache: boolean
  ): Promise<ChunkEmbedding[]> {
    const results: ChunkEmbedding[] = [];

    for (let i = 0; i < toEmbed.length; i += this.config.batchSize) {
      const batch = toEmbed.slice(i, i + this.config.batchSize);
      const response = await this.gateway.embed(
        batch.map((item) => item.chunk.content),
        {
          userId,
          model,
          dimensions: this.config.dimensions,
        }
      );

      this.collectBatchResults(batch, response.embeddings, response.model, skipCache, results);
    }

    return results;
  }

  private collectBatchResults(
    batch: Array<{ chunk: DocumentChunk; index: number }>,
    embeddings: Array<number[] | undefined>,
    model: string,
    skipCache: boolean,
    results: ChunkEmbedding[]
  ): void {
    for (let j = 0; j < batch.length; j++) {
      const embedding = embeddings[j];
      if (!embedding) {
        continue;
      }

      const result = this.toChunkEmbedding(batch[j].chunk, embedding, model);
      results.push(result);

      if (!skipCache) {
        this.addToCache(batch[j].chunk.id, model, embedding);
      }
    }
  }

  private sortResultsByInput(results: ChunkEmbedding[], chunks: DocumentChunk[]): ChunkEmbedding[] {
    const chunkIdOrder = new Map(chunks.map((c, i) => [c.id, i]));
    return results
      .slice()
      .sort((a, b) => (chunkIdOrder.get(a.chunkId) ?? 0) - (chunkIdOrder.get(b.chunkId) ?? 0));
  }

  private toChunkEmbedding(
    chunk: DocumentChunk,
    embedding: number[],
    model: string
  ): ChunkEmbedding {
    return {
      chunkId: chunk.id,
      docId: chunk.docId,
      embedding,
      model,
      dimensions: embedding.length,
      createdAt: Date.now(),
    };
  }

  /**
   * Clear cache.
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Get cache stats.
   */
  getCacheStats(): { size: number; maxSize: number } {
    return {
      size: this.cache.size,
      maxSize: this.config.maxCacheSize,
    };
  }

  /**
   * Get from cache.
   */
  private getFromCache(key: string, model: string): CacheEntry | null {
    const cacheKey = `${model}:${key}`;
    const entry = this.cache.get(cacheKey);

    if (!entry) {
      return null;
    }

    // Check expiry
    if (entry.expiresAt < Date.now()) {
      this.cache.delete(cacheKey);
      return null;
    }

    return entry;
  }

  /**
   * Add to cache.
   */
  private addToCache(key: string, model: string, embedding: number[]): void {
    // Evict if at capacity
    if (this.cache.size >= this.config.maxCacheSize) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey) {
        this.cache.delete(firstKey);
      }
    }

    const cacheKey = `${model}:${key}`;
    this.cache.set(cacheKey, {
      embedding,
      model,
      expiresAt: Date.now() + this.config.cacheTtlMs,
    });
  }

  /**
   * Simple hash for text caching.
   */
  private hashText(text: string): string {
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
      const char = text.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return hash.toString(36);
  }
}

/**
 * Cosine similarity between two vectors.
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error("Vectors must have the same dimension");
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const magnitude = Math.sqrt(normA) * Math.sqrt(normB);
  return magnitude === 0 ? 0 : dotProduct / magnitude;
}

/**
 * Find top-k similar embeddings.
 */
export function findTopK(
  query: number[],
  embeddings: ChunkEmbedding[],
  k: number
): Array<{ embedding: ChunkEmbedding; similarity: number }> {
  const scored = embeddings.map((emb) => ({
    embedding: emb,
    similarity: cosineSimilarity(query, emb.embedding),
  }));

  scored.sort((a, b) => b.similarity - a.similarity);

  return scored.slice(0, k);
}
