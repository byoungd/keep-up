/**
 * Memory Store Implementation
 *
 * In-memory storage for the memory system.
 * Supports text search, semantic search, and consolidation.
 */

import type {
  ConsolidationResult,
  IMemoryStore,
  Memory,
  MemoryQuery,
  MemorySearchResult,
  MemoryStats,
  MemoryType,
} from "./types";
import { cosineSimilarity } from "./types";

// ============================================================================
// In-Memory Store
// ============================================================================

/**
 * In-memory implementation of the memory store.
 * Suitable for single-session use or development.
 */
export class InMemoryStore implements IMemoryStore {
  private readonly memories = new Map<string, Memory>();
  private memoryCounter = 0;

  /**
   * Add a new memory.
   */
  async add(memory: Omit<Memory, "id" | "accessCount" | "lastAccessedAt">): Promise<string> {
    const id = this.generateId();

    const fullMemory: Memory = {
      ...memory,
      id,
      accessCount: 0,
      lastAccessedAt: memory.createdAt,
    };

    this.memories.set(id, fullMemory);
    return id;
  }

  /**
   * Get a memory by ID.
   */
  async get(id: string): Promise<Memory | null> {
    const memory = this.memories.get(id);
    if (memory) {
      // Update access stats
      memory.accessCount++;
      memory.lastAccessedAt = Date.now();
    }
    return memory ?? null;
  }

  /**
   * Update a memory.
   */
  async update(id: string, updates: Partial<Memory>): Promise<void> {
    const memory = this.memories.get(id);
    if (memory) {
      Object.assign(memory, updates);
    }
  }

  /**
   * Delete a memory.
   */
  async delete(id: string): Promise<boolean> {
    return this.memories.delete(id);
  }

  /**
   * Search memories by text.
   */
  async search(
    query: string,
    options?: { limit?: number; types?: MemoryType[] }
  ): Promise<Memory[]> {
    const limit = options?.limit ?? 10;
    const types = options?.types;
    const queryLower = query.toLowerCase();

    const results: Array<{ memory: Memory; score: number }> = [];

    for (const memory of this.memories.values()) {
      // Filter by type
      if (types && !types.includes(memory.type)) {
        continue;
      }

      // Calculate text match score
      const score = this.calculateTextScore(memory, queryLower);
      if (score > 0) {
        results.push({ memory, score });
      }
    }

    // Sort by score and return top results
    return results
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map((r) => {
        // Update access stats
        r.memory.accessCount++;
        r.memory.lastAccessedAt = Date.now();
        return r.memory;
      });
  }

  /**
   * Search memories by semantic similarity.
   */
  async semanticSearch(
    embedding: number[],
    options?: { limit?: number; threshold?: number }
  ): Promise<Memory[]> {
    const limit = options?.limit ?? 10;
    const threshold = options?.threshold ?? 0.7;

    const results: Array<{ memory: Memory; score: number }> = [];

    for (const memory of this.memories.values()) {
      if (!memory.embedding) {
        continue;
      }

      const score = cosineSimilarity(embedding, memory.embedding);
      if (score >= threshold) {
        results.push({ memory, score });
      }
    }

    return results
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map((r) => {
        r.memory.accessCount++;
        r.memory.lastAccessedAt = Date.now();
        return r.memory;
      });
  }

  /**
   * Query memories with filters.
   */
  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: query supports multiple filters and scoring strategies
  async query(query: MemoryQuery): Promise<MemorySearchResult> {
    const startTime = Date.now();
    let results = Array.from(this.memories.values());
    const scores: number[] = [];

    // Apply filters
    if (query.types && query.types.length > 0) {
      results = results.filter((m) => query.types?.includes(m.type));
    }

    if (query.tags && query.tags.length > 0) {
      results = results.filter((m) => query.tags?.some((t) => m.tags.includes(t)));
    }

    if (query.source) {
      results = results.filter((m) => m.source === query.source);
    }

    if (query.sessionId) {
      results = results.filter((m) => m.sessionId === query.sessionId);
    }

    if (query.minImportance !== undefined) {
      const minImportance = query.minImportance;
      results = results.filter((m) => m.importance >= minImportance);
    }

    if (query.createdAfter !== undefined) {
      const createdAfter = query.createdAfter;
      results = results.filter((m) => m.createdAt >= createdAfter);
    }

    if (query.createdBefore !== undefined) {
      const createdBefore = query.createdBefore;
      results = results.filter((m) => m.createdAt <= createdBefore);
    }

    // Calculate scores based on search method
    let method: "text" | "semantic" | "hybrid" = "text";

    if (query.embedding && query.text) {
      method = "hybrid";
      // Hybrid: combine text and semantic scores
      for (const memory of results) {
        const textScore = this.calculateTextScore(memory, query.text.toLowerCase());
        const semanticScore = memory.embedding
          ? cosineSimilarity(query.embedding, memory.embedding)
          : 0;
        scores.push(textScore * 0.4 + semanticScore * 0.6);
      }
    } else if (query.embedding) {
      method = "semantic";
      for (const memory of results) {
        const score = memory.embedding ? cosineSimilarity(query.embedding, memory.embedding) : 0;
        scores.push(score);
      }
    } else if (query.text) {
      method = "text";
      for (const memory of results) {
        scores.push(this.calculateTextScore(memory, query.text.toLowerCase()));
      }
    } else {
      // No search, score by recency and importance
      for (const memory of results) {
        scores.push(memory.importance * 0.5 + this.recencyScore(memory) * 0.5);
      }
    }

    // Sort by score
    const indexed = results.map((m, i) => ({ memory: m, score: scores[i] }));
    indexed.sort((a, b) => b.score - a.score);

    // Apply limit
    const total = indexed.length;
    const limit = query.limit ?? 10;
    const limited = indexed.slice(0, limit);

    // Update access stats
    for (const item of limited) {
      item.memory.accessCount++;
      item.memory.lastAccessedAt = Date.now();
    }

    // Remove embeddings if not requested
    const finalMemories = limited.map((item) => {
      if (!query.includeEmbeddings) {
        const { embedding, ...rest } = item.memory;
        return rest as Memory;
      }
      return item.memory;
    });

    return {
      memories: finalMemories,
      scores: limited.map((item) => item.score),
      total,
      meta: {
        query,
        searchTimeMs: Date.now() - startTime,
        method,
      },
    };
  }

  /**
   * Get recent memories.
   */
  async getRecent(limit = 10): Promise<Memory[]> {
    return Array.from(this.memories.values())
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, limit);
  }

  /**
   * Get memories by type.
   */
  async getByType(type: MemoryType, limit = 10): Promise<Memory[]> {
    return Array.from(this.memories.values())
      .filter((m) => m.type === type)
      .sort((a, b) => b.importance - a.importance)
      .slice(0, limit);
  }

  /**
   * Get memories by tags.
   */
  async getByTags(tags: string[], limit = 10): Promise<Memory[]> {
    return Array.from(this.memories.values())
      .filter((m) => tags.some((t) => m.tags.includes(t)))
      .sort((a, b) => b.importance - a.importance)
      .slice(0, limit);
  }

  /**
   * Consolidate memories.
   */
  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: consolidation walks memory graph and merges entries
  async consolidate(): Promise<ConsolidationResult> {
    const startTime = Date.now();
    const memoriesBefore = this.memories.size;

    // Group memories by type
    const byType = new Map<MemoryType, Memory[]>();
    for (const memory of this.memories.values()) {
      const existing = byType.get(memory.type) ?? [];
      existing.push(memory);
      byType.set(memory.type, existing);
    }

    let deleted = 0;
    let merged = 0;
    const summaries: string[] = [];

    // Process each type
    for (const [type, memories] of byType) {
      // Sort by importance (ascending) for deletion candidates
      memories.sort((a, b) => a.importance - b.importance);

      // Delete low-importance old memories
      const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000; // 7 days
      for (const memory of memories) {
        if (memory.importance < 0.3 && memory.createdAt < cutoff) {
          this.memories.delete(memory.id);
          deleted++;
        }
      }

      // Merge similar memories (simple deduplication)
      if (type === "conversation") {
        const remaining = Array.from(this.memories.values()).filter(
          (m) => m.type === "conversation"
        );

        if (remaining.length > 50) {
          // Create a summary of old conversations
          const toSummarize = remaining
            .sort((a, b) => a.createdAt - b.createdAt)
            .slice(0, remaining.length - 50);

          const summary = toSummarize.map((m) => m.content.substring(0, 100)).join(" | ");

          // Delete old conversations
          for (const m of toSummarize) {
            this.memories.delete(m.id);
            deleted++;
          }

          // Add summary
          if (summary.length > 0) {
            await this.add({
              type: "summary",
              content: `Conversation summary: ${summary.substring(0, 500)}`,
              importance: 0.5,
              createdAt: Date.now(),
              source: "consolidation",
              tags: ["auto-summary"],
            });
            summaries.push(summary.substring(0, 100));
            merged += toSummarize.length;
          }
        }
      }
    }

    return {
      memoriesBefore,
      memoriesAfter: this.memories.size,
      deleted,
      merged,
      summaries,
      durationMs: Date.now() - startTime,
    };
  }

  /**
   * Apply decay to importance scores.
   */
  async applyDecay(decayRate: number): Promise<number> {
    let decayed = 0;
    const now = Date.now();
    const dayMs = 24 * 60 * 60 * 1000;

    for (const memory of this.memories.values()) {
      const daysSinceAccess = (now - memory.lastAccessedAt) / dayMs;

      if (daysSinceAccess > 1) {
        const decay = (1 - decayRate) ** daysSinceAccess;
        memory.importance = memory.importance * decay;
        decayed++;
      }
    }

    return decayed;
  }

  /**
   * Get storage statistics.
   */
  async getStats(): Promise<MemoryStats> {
    const memories = Array.from(this.memories.values());

    const byType: Record<MemoryType, number> = {
      fact: 0,
      preference: 0,
      codebase: 0,
      conversation: 0,
      decision: 0,
      error: 0,
      tool_result: 0,
      summary: 0,
    };

    let totalImportance = 0;
    let sizeBytes = 0;
    let oldest: number | undefined;
    let newest: number | undefined;

    for (const memory of memories) {
      byType[memory.type]++;
      totalImportance += memory.importance;
      sizeBytes += JSON.stringify(memory).length;

      if (!oldest || memory.createdAt < oldest) {
        oldest = memory.createdAt;
      }
      if (!newest || memory.createdAt > newest) {
        newest = memory.createdAt;
      }
    }

    return {
      total: memories.length,
      byType,
      averageImportance: memories.length > 0 ? totalImportance / memories.length : 0,
      sizeBytes,
      oldestAt: oldest,
      newestAt: newest,
    };
  }

  /**
   * Clear all memories.
   */
  async clear(): Promise<void> {
    this.memories.clear();
  }

  /**
   * Get all memories (for export).
   */
  getAll(): Memory[] {
    return Array.from(this.memories.values());
  }

  /**
   * Bulk import memories.
   */
  async bulkImport(memories: Memory[]): Promise<number> {
    let imported = 0;
    for (const memory of memories) {
      this.memories.set(memory.id, memory);
      imported++;
    }
    return imported;
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private generateId(): string {
    return `mem-${Date.now().toString(36)}-${(++this.memoryCounter).toString(36)}`;
  }

  private calculateTextScore(memory: Memory, query: string): number {
    const content = memory.content.toLowerCase();
    const tags = memory.tags.join(" ").toLowerCase();

    let score = 0;

    // Exact phrase match
    if (content.includes(query)) {
      score += 1.0;
    }

    // Word matches
    const queryWords = query.split(/\s+/);
    const contentWords = content.split(/\s+/);

    for (const word of queryWords) {
      if (word.length < 2) {
        continue;
      }

      // Exact word match
      if (contentWords.includes(word)) {
        score += 0.5;
      }

      // Partial match
      if (content.includes(word)) {
        score += 0.3;
      }

      // Tag match
      if (tags.includes(word)) {
        score += 0.4;
      }
    }

    // Boost by importance
    score *= 1 + memory.importance * 0.5;

    return score;
  }

  private recencyScore(memory: Memory): number {
    const age = Date.now() - memory.createdAt;
    const dayMs = 24 * 60 * 60 * 1000;
    const days = age / dayMs;

    // Exponential decay over 30 days
    return Math.exp(-days / 30);
  }
}

// ============================================================================
// Factory
// ============================================================================

/**
 * Create an in-memory store.
 */
export function createInMemoryStore(): InMemoryStore {
  return new InMemoryStore();
}
