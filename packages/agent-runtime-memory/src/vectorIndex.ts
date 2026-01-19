/**
 * Vector Index Implementation
 *
 * Simple in-memory vector index for semantic search.
 * Uses cosine similarity for nearest neighbor search.
 */

import type { Memory } from "./types";
import { cosineSimilarity } from "./types";

// ============================================================================
// Vector Index Types
// ============================================================================

/**
 * Entry in the vector index.
 */
interface VectorEntry {
  id: string;
  embedding: number[];
  metadata?: Record<string, unknown>;
}

/**
 * Search result with score.
 */
export interface VectorSearchResult {
  id: string;
  score: number;
  metadata?: Record<string, unknown>;
}

/**
 * Configuration for the vector index.
 */
export interface VectorIndexConfig {
  /** Expected embedding dimension */
  dimension: number;

  /** Maximum entries to store */
  maxEntries?: number;
}

// ============================================================================
// Vector Index Implementation
// ============================================================================

/**
 * Simple in-memory vector index.
 * Uses brute-force search (suitable for small datasets).
 */
export class VectorIndex {
  private readonly config: Required<VectorIndexConfig>;
  private readonly entries = new Map<string, VectorEntry>();

  constructor(config: VectorIndexConfig) {
    this.config = {
      ...config,
      maxEntries: config.maxEntries ?? 10000,
    };
  }

  /**
   * Add an entry to the index.
   */
  add(id: string, embedding: number[], metadata?: Record<string, unknown>): void {
    if (embedding.length !== this.config.dimension) {
      throw new Error(
        `Embedding dimension mismatch: expected ${this.config.dimension}, got ${embedding.length}`
      );
    }

    // Enforce max entries
    if (this.entries.size >= this.config.maxEntries && !this.entries.has(id)) {
      // Remove oldest entry (first in map)
      const firstKey = this.entries.keys().next().value;
      if (firstKey) {
        this.entries.delete(firstKey);
      }
    }

    this.entries.set(id, { id, embedding, metadata });
  }

  /**
   * Remove an entry from the index.
   */
  remove(id: string): boolean {
    return this.entries.delete(id);
  }

  /**
   * Search for nearest neighbors.
   */
  search(
    queryEmbedding: number[],
    options?: { limit?: number; threshold?: number }
  ): VectorSearchResult[] {
    const limit = options?.limit ?? 10;
    const threshold = options?.threshold ?? 0;

    if (queryEmbedding.length !== this.config.dimension) {
      throw new Error(
        `Query embedding dimension mismatch: expected ${this.config.dimension}, got ${queryEmbedding.length}`
      );
    }

    const results: VectorSearchResult[] = [];

    for (const entry of this.entries.values()) {
      const score = cosineSimilarity(queryEmbedding, entry.embedding);
      if (score >= threshold) {
        results.push({
          id: entry.id,
          score,
          metadata: entry.metadata,
        });
      }
    }

    // Sort by score descending
    results.sort((a, b) => b.score - a.score);

    return results.slice(0, limit);
  }

  /**
   * Get entry count.
   */
  get size(): number {
    return this.entries.size;
  }

  /**
   * Check if an entry exists.
   */
  has(id: string): boolean {
    return this.entries.has(id);
  }

  /**
   * Get an entry by ID.
   */
  get(id: string): VectorEntry | undefined {
    return this.entries.get(id);
  }

  /**
   * Clear all entries.
   */
  clear(): void {
    this.entries.clear();
  }

  /**
   * Get all IDs.
   */
  getIds(): string[] {
    return Array.from(this.entries.keys());
  }
}

// ============================================================================
// Memory Vector Index
// ============================================================================

/**
 * Vector index specialized for Memory objects.
 */
export class MemoryVectorIndex extends VectorIndex {
  /**
   * Add a memory to the index.
   */
  addMemory(memory: Memory): void {
    if (!memory.embedding) {
      throw new Error("Memory has no embedding");
    }

    this.add(memory.id, memory.embedding, {
      type: memory.type,
      importance: memory.importance,
      createdAt: memory.createdAt,
    });
  }

  /**
   * Search for similar memories.
   */
  searchSimilar(
    queryEmbedding: number[],
    options?: {
      limit?: number;
      threshold?: number;
      minImportance?: number;
    }
  ): VectorSearchResult[] {
    const results = this.search(queryEmbedding, {
      limit: (options?.limit ?? 10) * 2, // Over-fetch to allow filtering
      threshold: options?.threshold,
    });

    // Filter by importance if specified
    if (options?.minImportance !== undefined) {
      const minImportance = options.minImportance;
      const filtered = results.filter(
        (r) =>
          r.metadata?.importance !== undefined && (r.metadata.importance as number) >= minImportance
      );
      return filtered.slice(0, options?.limit ?? 10);
    }

    return results.slice(0, options?.limit ?? 10);
  }
}

// ============================================================================
// Mock Embedding Provider
// ============================================================================

/**
 * Mock embedding provider for testing.
 * Generates deterministic embeddings based on text hash.
 */
export class MockEmbeddingProvider {
  private readonly dimension: number;

  constructor(dimension = 384) {
    this.dimension = dimension;
  }

  /**
   * Generate a mock embedding from text.
   */
  async embed(text: string): Promise<number[]> {
    // Simple hash-based embedding
    const hash = this.hashString(text);
    const embedding: number[] = [];

    for (let i = 0; i < this.dimension; i++) {
      // Use hash to seed pseudo-random values
      const value = Math.sin(hash * (i + 1)) * 0.5 + 0.5;
      embedding.push(value);
    }

    // Normalize
    return this.normalize(embedding);
  }

  /**
   * Generate embeddings for multiple texts.
   */
  async embedBatch(texts: string[]): Promise<number[][]> {
    return Promise.all(texts.map((t) => this.embed(t)));
  }

  /**
   * Get embedding dimension.
   */
  getDimension(): number {
    return this.dimension;
  }

  private hashString(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash + char) | 0;
    }
    return Math.abs(hash);
  }

  private normalize(vec: number[]): number[] {
    const norm = Math.sqrt(vec.reduce((sum, v) => sum + v * v, 0));
    return norm > 0 ? vec.map((v) => v / norm) : vec;
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a vector index.
 */
export function createVectorIndex(config: VectorIndexConfig): VectorIndex {
  return new VectorIndex(config);
}

/**
 * Create a memory vector index.
 */
export function createMemoryVectorIndex(dimension = 384): MemoryVectorIndex {
  return new MemoryVectorIndex({ dimension });
}

/**
 * Create a mock embedding provider.
 */
export function createMockEmbeddingProvider(dimension = 384): MockEmbeddingProvider {
  return new MockEmbeddingProvider(dimension);
}
