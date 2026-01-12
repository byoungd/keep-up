/**
 * Memory Manager Implementation
 *
 * High-level memory management with context tracking,
 * automatic consolidation, and event emission.
 */

import { InMemoryStore, createInMemoryStore } from "./memoryStore";
import type {
  ConsolidationResult,
  IEmbeddingProvider,
  IMemoryManager,
  IMemoryStore,
  Memory,
  MemoryConfig,
  MemoryEvent,
  MemoryEventHandler,
  MemoryEventType,
  MemoryStats,
  MemoryType,
  RecallOptions,
  RememberOptions,
} from "./types";
import { DEFAULT_MEMORY_CONFIG } from "./types";

// ============================================================================
// Conversation Context
// ============================================================================

interface ContextMessage {
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: number;
  tokens: number;
}

// ============================================================================
// Memory Manager
// ============================================================================

/**
 * High-level memory manager with context tracking.
 */
export class MemoryManager implements IMemoryManager {
  private readonly config: MemoryConfig;
  private readonly store: IMemoryStore;
  private readonly embeddingProvider?: IEmbeddingProvider;
  private readonly eventHandlers = new Set<MemoryEventHandler>();

  private context: ContextMessage[] = [];
  private contextTokens = 0;
  private turnCount = 0;
  private sessionId: string;

  constructor(
    config: Partial<MemoryConfig> = {},
    store?: IMemoryStore,
    embeddingProvider?: IEmbeddingProvider
  ) {
    this.config = { ...DEFAULT_MEMORY_CONFIG, ...config };
    this.store = store ?? createInMemoryStore();
    this.embeddingProvider = embeddingProvider;
    this.sessionId = generateSessionId();
  }

  /**
   * Remember a piece of information.
   */
  async remember(content: string, options: RememberOptions = {}): Promise<string> {
    const type: MemoryType = options.type ?? "fact";
    const importance = options.importance ?? this.calculateDefaultImportance(type);

    // Generate embedding if provider available
    let embedding: number[] | undefined;
    if (this.embeddingProvider && this.config.vectorSearchEnabled) {
      try {
        embedding = await this.embeddingProvider.embed(content);
      } catch {
        // Embedding failed, continue without it
      }
    }

    const memory: Omit<Memory, "id" | "accessCount" | "lastAccessedAt"> = {
      type,
      content,
      embedding,
      importance,
      createdAt: Date.now(),
      source: options.source ?? "user",
      tags: options.tags ?? [],
      sessionId: options.sessionId ?? this.sessionId,
      metadata: options.metadata,
    };

    const id = await this.store.add(memory);

    this.emit("memory:added", { id, type, content: content.substring(0, 100) });

    // Check if consolidation is needed
    this.turnCount++;
    if (this.turnCount % this.config.consolidationInterval === 0) {
      await this.maybeConsolidate();
    }

    return id;
  }

  /**
   * Recall relevant memories for a query.
   */
  async recall(query: string, options: RecallOptions = {}): Promise<Memory[]> {
    const limit = options.limit ?? 10;
    const minImportance = options.minImportance ?? 0;
    const useSemanticSearch = options.useSemanticSearch ?? true;

    let embedding: number[] | undefined;
    if (useSemanticSearch && this.embeddingProvider && this.config.vectorSearchEnabled) {
      try {
        embedding = await this.embeddingProvider.embed(query);
      } catch {
        // Embedding failed, fall back to text search
      }
    }

    const result = await this.store.query({
      text: query,
      embedding,
      types: options.types,
      tags: options.tags,
      minImportance,
      limit,
    });

    // Emit access events
    for (const memory of result.memories) {
      this.emit("memory:accessed", { id: memory.id });
    }

    return result.memories;
  }

  /**
   * Forget a specific memory.
   */
  async forget(id: string): Promise<void> {
    await this.store.delete(id);
    this.emit("memory:deleted", { id });
  }

  /**
   * Reinforce a memory (increase importance).
   */
  async reinforce(id: string): Promise<void> {
    const memory = await this.store.get(id);
    if (memory) {
      const newImportance = Math.min(1, memory.importance + 0.1);
      await this.store.update(id, { importance: newImportance });
      this.emit("memory:updated", { id, importance: newImportance });
    }
  }

  async getContext(maxTokens?: number): Promise<string> {
    const limit = maxTokens ?? this.config.shortTermLimit;
    const messages: string[] = [];
    let tokens = 0;

    // Most recent first
    for (let i = this.context.length - 1; i >= 0 && tokens < limit; i--) {
      const msg = this.context[i];
      if (tokens + msg.tokens <= limit) {
        messages.unshift(`[${msg.role}]: ${msg.content}`);
        tokens += msg.tokens;
      }
    }

    // Also include relevant long-term memories
    if (this.config.longTermEnabled && messages.length > 0) {
      await this.addLongTermContext(messages);
    }

    return messages.join("\n");
  }

  private async addLongTermContext(messages: string[]): Promise<void> {
    const lastUserMessage = this.context.filter((m) => m.role === "user").pop();

    if (lastUserMessage) {
      const memories = await this.recall(lastUserMessage.content, {
        limit: 3,
        minImportance: 0.5,
        types: ["fact", "codebase", "preference"],
      });

      if (memories.length > 0) {
        messages.unshift("--- Relevant memories ---");
        for (const memory of memories) {
          messages.unshift(`[${memory.type}]: ${memory.content}`);
        }
        messages.unshift("--- Context ---");
      }
    }
  }

  /**
   * Add to conversation context.
   */
  async addToContext(message: string, role: "user" | "assistant" | "system"): Promise<void> {
    const tokens = estimateTokens(message);

    this.context.push({
      role,
      content: message,
      timestamp: Date.now(),
      tokens,
    });
    this.contextTokens += tokens;

    // Trim context if needed
    while (this.contextTokens > this.config.shortTermLimit && this.context.length > 1) {
      const removed = this.context.shift();
      if (removed) {
        this.contextTokens -= removed.tokens;

        // Save to long-term memory if important
        if (this.config.longTermEnabled && removed.role === "user") {
          await this.remember(removed.content, {
            type: "conversation",
            importance: 0.3,
            source: "context-overflow",
          });
        }
      }
    }

    this.emit("context:updated", {
      messageCount: this.context.length,
      tokens: this.contextTokens,
    });
  }

  /**
   * Clear conversation context.
   */
  async clearContext(): Promise<void> {
    // Optionally save context summary
    if (this.config.longTermEnabled && this.context.length > 0) {
      const summary = this.context
        .map((m) => `${m.role}: ${m.content.substring(0, 50)}`)
        .join(" | ");

      await this.remember(`Session summary: ${summary.substring(0, 500)}`, {
        type: "summary",
        importance: 0.4,
        source: "context-clear",
        tags: ["session-end"],
      });
    }

    this.context = [];
    this.contextTokens = 0;
    this.emit("context:cleared", {});
  }

  /**
   * Trigger memory consolidation.
   */
  async consolidate(): Promise<ConsolidationResult> {
    this.emit("consolidation:start", {});

    const result = await this.store.consolidate();

    // Apply decay
    const decayed = await this.store.applyDecay(this.config.decayRate);

    this.emit("consolidation:complete", {
      ...result,
      decayed,
    });

    return result;
  }

  /**
   * Get memory statistics.
   */
  async getStats(): Promise<MemoryStats> {
    return this.store.getStats();
  }

  /**
   * Export memories for backup.
   */
  async export(): Promise<string> {
    if (this.store instanceof InMemoryStore) {
      const memories = this.store.getAll();
      return JSON.stringify({
        version: 1,
        exportedAt: Date.now(),
        sessionId: this.sessionId,
        memories,
        context: this.context,
      });
    }
    throw new Error("Export not supported for this store type");
  }

  /**
   * Import memories from backup.
   */
  async import(data: string): Promise<number> {
    const parsed = JSON.parse(data);

    if (parsed.version !== 1) {
      throw new Error(`Unsupported export version: ${parsed.version}`);
    }

    if (this.store instanceof InMemoryStore) {
      const imported = await this.store.bulkImport(parsed.memories);

      // Restore context if present
      if (parsed.context) {
        this.context = parsed.context;
        this.contextTokens = this.context.reduce((sum, m) => sum + m.tokens, 0);
      }

      return imported;
    }

    throw new Error("Import not supported for this store type");
  }

  /**
   * Subscribe to memory events.
   */
  on(handler: MemoryEventHandler): () => void {
    this.eventHandlers.add(handler);
    return () => this.eventHandlers.delete(handler);
  }

  /**
   * Get current session ID.
   */
  getSessionId(): string {
    return this.sessionId;
  }

  /**
   * Start a new session.
   */
  async newSession(): Promise<string> {
    await this.clearContext();
    this.sessionId = generateSessionId();
    this.turnCount = 0;
    return this.sessionId;
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private async maybeConsolidate(): Promise<void> {
    const stats = await this.store.getStats();

    if (stats.total > this.config.maxMemories) {
      await this.consolidate();
    }
  }

  private calculateDefaultImportance(type: MemoryType): number {
    switch (type) {
      case "preference":
        return 0.8;
      case "decision":
        return 0.7;
      case "fact":
        return 0.6;
      case "codebase":
        return 0.6;
      case "error":
        return 0.5;
      case "tool_result":
        return 0.4;
      case "conversation":
        return 0.3;
      case "summary":
        return 0.5;
      default:
        return 0.5;
    }
  }

  private emit(type: MemoryEventType, data: unknown): void {
    const event: MemoryEvent = {
      type,
      timestamp: Date.now(),
      data,
    };

    for (const handler of this.eventHandlers) {
      try {
        handler(event);
      } catch {
        // Don't let handler errors break the manager
      }
    }
  }
}

// ============================================================================
// Utility Functions
// ============================================================================

function generateSessionId(): string {
  return `session-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

// ============================================================================
// Factory
// ============================================================================

/**
 * Create a memory manager with default configuration.
 */
export function createMemoryManager(
  config?: Partial<MemoryConfig>,
  embeddingProvider?: IEmbeddingProvider
): MemoryManager {
  return new MemoryManager(config, undefined, embeddingProvider);
}

/**
 * Create a memory manager with custom store.
 */
export function createMemoryManagerWithStore(
  store: IMemoryStore,
  config?: Partial<MemoryConfig>,
  embeddingProvider?: IEmbeddingProvider
): MemoryManager {
  return new MemoryManager(config, store, embeddingProvider);
}
