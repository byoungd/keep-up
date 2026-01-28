/**
 * Mem0 Memory Adapter
 *
 * Integrates mem0ai for advanced memory management with
 * multi-level memory, semantic search, and conversation history.
 */

import { type Memory as Mem0Memory, MemoryClient, type SearchOptions } from "mem0ai";

import type {
  ConsolidationResult,
  IMemoryManager,
  Memory,
  MemoryStats,
  MemoryType,
  RecallOptions,
  RememberOptions,
} from "./types";

/**
 * Mem0 adapter configuration
 */
export interface Mem0Config {
  /** Mem0 API key (required for cloud) */
  apiKey: string;
  /** Custom host for self-hosted Mem0 */
  host?: string;
  /** Organization name */
  organizationName?: string;
  /** Project name */
  projectName?: string;
  /** Default user ID for memories */
  defaultUserId?: string;
  /** Default agent ID */
  defaultAgentId?: string;
}

/**
 * Mem0 Memory Adapter
 *
 * Wraps the mem0ai MemoryClient to provide our IMemoryManager interface.
 */
export class Mem0MemoryAdapter implements IMemoryManager {
  private readonly client: MemoryClient;
  private readonly config: Mem0Config;
  private context: Array<{ role: "user" | "assistant" | "system"; content: string }> = [];
  private stats = {
    total: 0,
    byType: {} as Record<MemoryType, number>,
  };

  constructor(config: Mem0Config) {
    this.config = config;
    this.client = new MemoryClient({
      apiKey: config.apiKey,
      host: config.host,
      organizationName: config.organizationName,
      projectName: config.projectName,
    });
  }

  /**
   * Store a new memory
   */
  async remember(content: string, options?: RememberOptions): Promise<string> {
    const messages = [
      {
        role: "user" as const,
        content,
      },
    ];

    const mem0Options = {
      user_id: options?.sessionId ?? this.config.defaultUserId,
      agent_id: this.config.defaultAgentId,
      metadata: {
        type: options?.type ?? "fact",
        importance: options?.importance ?? 0.5,
        tags: options?.tags ?? [],
        source: options?.source ?? "user",
        ...options?.metadata,
      },
    };

    const result = await this.client.add(messages, mem0Options);
    const mem0Memory = result[0];

    // Update stats
    const type = options?.type ?? "fact";
    this.stats.total++;
    this.stats.byType[type] = (this.stats.byType[type] ?? 0) + 1;

    return mem0Memory.id;
  }

  /**
   * Recall relevant memories for a query
   */
  async recall(query: string, options?: RecallOptions): Promise<Memory[]> {
    const searchOptions: SearchOptions = {
      user_id: this.config.defaultUserId,
      agent_id: this.config.defaultAgentId,
      limit: options?.limit ?? 10,
      threshold: options?.minImportance ?? 0.3,
    };

    // Add type filter if provided
    if (options?.types && options.types.length > 0) {
      searchOptions.categories = options.types;
    }

    const results = await this.client.search(query, searchOptions);

    return results.map((mem0Memory) => this.convertToMemory(mem0Memory));
  }

  /**
   * Forget a specific memory
   */
  async forget(id: string): Promise<void> {
    await this.client.delete(id);
    this.stats.total = Math.max(0, this.stats.total - 1);
  }

  /**
   * Update memory importance (reinforce)
   */
  async reinforce(id: string): Promise<void> {
    const existing = await this.client.get(id);
    if (existing) {
      const currentImportance = (existing.metadata?.importance as number) ?? 0.5;
      await this.client.update(id, {
        metadata: {
          ...existing.metadata,
          importance: Math.min(1, currentImportance + 0.1),
          accessCount: ((existing.metadata?.accessCount as number) ?? 0) + 1,
        },
      });
    }
  }

  /**
   * Get conversation context (short-term memories)
   */
  async getContext(maxTokens?: number): Promise<string> {
    // Convert context to string
    const contextStr = this.context.map((msg) => `${msg.role}: ${msg.content}`).join("\n");

    if (maxTokens) {
      // Rough token estimation (4 chars per token)
      const maxChars = maxTokens * 4;
      if (contextStr.length > maxChars) {
        return contextStr.slice(-maxChars);
      }
    }

    return contextStr;
  }

  /**
   * Add to conversation context
   */
  async addToContext(message: string, role: "user" | "assistant" | "system"): Promise<void> {
    this.context.push({ role, content: message });

    // Also save to Mem0 as conversation memory
    await this.remember(message, {
      type: "conversation",
      source: role,
      importance: 0.3,
    });
  }

  /**
   * Clear conversation context
   */
  async clearContext(): Promise<void> {
    this.context = [];
  }

  /**
   * Trigger memory consolidation
   */
  async consolidate(): Promise<ConsolidationResult> {
    const start = Date.now();
    const stats = await this.getStats();

    // Mem0 handles consolidation internally, so we return current stats.
    return {
      memoriesBefore: stats.total,
      memoriesAfter: stats.total,
      deleted: 0,
      merged: 0,
      summaries: [],
      durationMs: Date.now() - start,
    };
  }

  /**
   * Get memory statistics
   */
  async getStats(): Promise<MemoryStats> {
    const allMemories = await this.client.getAll({
      user_id: this.config.defaultUserId,
      agent_id: this.config.defaultAgentId,
      page_size: 1000,
    });

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
    let oldestAt: number | undefined;
    let newestAt: number | undefined;

    for (const mem of allMemories) {
      const type = (mem.metadata?.type as MemoryType) ?? "fact";
      byType[type] = (byType[type] ?? 0) + 1;
      totalImportance += (mem.metadata?.importance as number) ?? 0.5;

      const createdAt = mem.created_at ? new Date(mem.created_at).getTime() : Date.now();
      if (!oldestAt || createdAt < oldestAt) {
        oldestAt = createdAt;
      }
      if (!newestAt || createdAt > newestAt) {
        newestAt = createdAt;
      }
    }

    return {
      total: allMemories.length,
      byType,
      averageImportance: allMemories.length > 0 ? totalImportance / allMemories.length : 0,
      sizeBytes: JSON.stringify(allMemories).length,
      oldestAt,
      newestAt,
    };
  }

  /**
   * Export memories for backup
   */
  async export(): Promise<string> {
    const allMemories = await this.client.getAll({
      user_id: this.config.defaultUserId,
      agent_id: this.config.defaultAgentId,
      page_size: 10000,
    });

    return JSON.stringify(allMemories, null, 2);
  }

  /**
   * Import memories from backup
   */
  async import(data: string): Promise<number> {
    const memories = JSON.parse(data) as Mem0Memory[];
    let imported = 0;

    for (const mem of memories) {
      try {
        await this.remember(mem.memory ?? "", {
          type: (mem.metadata?.type as MemoryType) ?? "fact",
          importance: (mem.metadata?.importance as number) ?? 0.5,
          tags: mem.categories ?? [],
          metadata: mem.metadata ?? undefined,
        });
        imported++;
      } catch {
        // Skip failed imports
      }
    }

    return imported;
  }

  // --- Helper methods ---

  private convertToMemory(mem0Memory: Mem0Memory): Memory {
    return {
      id: mem0Memory.id,
      content: mem0Memory.memory ?? mem0Memory.data?.memory ?? "",
      type: (mem0Memory.metadata?.type as MemoryType) ?? "fact",
      createdAt: mem0Memory.created_at ? new Date(mem0Memory.created_at).getTime() : Date.now(),
      lastAccessedAt: mem0Memory.updated_at
        ? new Date(mem0Memory.updated_at).getTime()
        : Date.now(),
      importance: (mem0Memory.metadata?.importance as number) ?? 0.5,
      accessCount: (mem0Memory.metadata?.accessCount as number) ?? 0,
      source: (mem0Memory.metadata?.source as string) ?? "unknown",
      tags: mem0Memory.categories ?? [],
      metadata: {
        userId: mem0Memory.user_id,
        agentId: mem0Memory.agent_id,
        hash: mem0Memory.hash,
        score: mem0Memory.score,
        ...mem0Memory.metadata,
      },
    };
  }
}

/**
 * Create a Mem0 memory adapter
 */
export function createMem0MemoryAdapter(config: Mem0Config): Mem0MemoryAdapter {
  return new Mem0MemoryAdapter(config);
}

// Re-export Mem0 types
export { MemoryClient } from "mem0ai";
export type { Mem0Memory };
