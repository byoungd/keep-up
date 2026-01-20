/**
 * Memory System Types
 *
 * Type definitions for persistent cross-session memory.
 * Supports short-term, long-term, and semantic memory.
 */

// ============================================================================
// Memory Configuration
// ============================================================================

/**
 * Configuration for the memory system.
 */
export interface MemoryConfig {
  /** Maximum tokens for short-term memory (conversation context) */
  shortTermLimit: number;

  /** Enable long-term memory persistence */
  longTermEnabled: boolean;

  /** Enable vector-based semantic search */
  vectorSearchEnabled: boolean;

  /** Auto-consolidate every N turns */
  consolidationInterval: number;

  /** Maximum memories to keep */
  maxMemories: number;

  /** Memory decay rate (0-1, lower = slower decay) */
  decayRate: number;

  /** Minimum importance to keep during consolidation */
  importanceThreshold: number;
}

/**
 * Default memory configuration.
 */
export const DEFAULT_MEMORY_CONFIG: MemoryConfig = {
  shortTermLimit: 4096,
  longTermEnabled: true,
  vectorSearchEnabled: true,
  consolidationInterval: 10,
  maxMemories: 1000,
  decayRate: 0.1,
  importanceThreshold: 0.3,
};

// ============================================================================
// Memory Types
// ============================================================================

/**
 * Types of memories that can be stored.
 */
export type MemoryType =
  | "fact" // Factual information
  | "preference" // User preferences
  | "codebase" // Codebase knowledge
  | "conversation" // Conversation context
  | "decision" // Decisions made
  | "error" // Errors encountered
  | "tool_result" // Tool execution results
  | "summary"; // Consolidated summaries

// ============================================================================
// Lesson Types
// ============================================================================

export type LessonScope = "project" | "global";

export type LessonProfile = "default" | "strict-reviewer" | "creative-prototyper";

export type LessonSource = "critic" | "manual";

export interface Lesson {
  /** Unique lesson ID */
  id: string;

  /** Trigger text that should surface this lesson */
  trigger: string;

  /** The learned rule to apply */
  rule: string;

  /** Confidence score (0-1) */
  confidence: number;

  /** Scope for the lesson */
  scope: LessonScope;

  /** Project ID for scoped lessons */
  projectId?: string;

  /** Personality profile */
  profile: LessonProfile;

  /** Origin of the lesson */
  source: LessonSource;

  /** Created timestamp */
  createdAt: number;

  /** Updated timestamp */
  updatedAt: number;

  /** Optional embedding for vector search */
  embedding?: number[];

  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * A single memory entry.
 */
export interface Memory {
  /** Unique memory ID */
  id: string;

  /** Type of memory */
  type: MemoryType;

  /** Memory content (the actual information) */
  content: string;

  /** Vector embedding for semantic search */
  embedding?: number[];

  /** Importance score (0-1, higher = more important) */
  importance: number;

  /** Creation timestamp */
  createdAt: number;

  /** Last access timestamp (for decay) */
  lastAccessedAt: number;

  /** Access count (for importance calculation) */
  accessCount: number;

  /** Source that created this memory */
  source: string;

  /** Tags for categorization */
  tags: string[];

  /** Related memory IDs */
  relatedIds?: string[];

  /** Session ID where memory was created */
  sessionId?: string;

  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Query for searching memories.
 */
export interface MemoryQuery {
  /** Text search (fuzzy match) */
  text?: string;

  /** Semantic search embedding */
  embedding?: number[];

  /** Filter by type */
  types?: MemoryType[];

  /** Filter by tags */
  tags?: string[];

  /** Filter by source */
  source?: string;

  /** Filter by session */
  sessionId?: string;

  /** Minimum importance */
  minImportance?: number;

  /** Created after timestamp */
  createdAfter?: number;

  /** Created before timestamp */
  createdBefore?: number;

  /** Maximum results */
  limit?: number;

  /** Include embeddings in results */
  includeEmbeddings?: boolean;
}

/**
 * Result of a memory search.
 */
export interface MemorySearchResult {
  /** Matching memories */
  memories: Memory[];

  /** Relevance scores (parallel to memories array) */
  scores: number[];

  /** Total count (for pagination) */
  total: number;

  /** Search metadata */
  meta: {
    query: MemoryQuery;
    searchTimeMs: number;
    method: "text" | "semantic" | "hybrid";
  };
}

// ============================================================================
// Memory Store Interface
// ============================================================================

/**
 * Interface for memory storage backends.
 */
export interface IMemoryStore {
  /** Add a new memory */
  add(memory: Omit<Memory, "id" | "accessCount" | "lastAccessedAt">): Promise<string>;

  /** Get a memory by ID */
  get(id: string): Promise<Memory | null>;

  /** Update a memory */
  update(id: string, updates: Partial<Memory>): Promise<void>;

  /** Delete a memory */
  delete(id: string): Promise<boolean>;

  /** Search memories by text */
  search(query: string, options?: { limit?: number; types?: MemoryType[] }): Promise<Memory[]>;

  /** Search memories by semantic similarity */
  semanticSearch(
    embedding: number[],
    options?: { limit?: number; threshold?: number }
  ): Promise<Memory[]>;

  /** Query memories with filters */
  query(query: MemoryQuery): Promise<MemorySearchResult>;

  /** Get recent memories */
  getRecent(limit?: number): Promise<Memory[]>;

  /** Get memories by type */
  getByType(type: MemoryType, limit?: number): Promise<Memory[]>;

  /** Get memories by tags */
  getByTags(tags: string[], limit?: number): Promise<Memory[]>;

  /** Consolidate memories (summarize and prune) */
  consolidate(): Promise<ConsolidationResult>;

  /** Apply decay to importance scores */
  applyDecay(decayRate: number): Promise<number>;

  /** Get storage statistics */
  getStats(): Promise<MemoryStats>;

  /** Clear all memories */
  clear(): Promise<void>;
}

// ============================================================================
// Memory Manager Interface
// ============================================================================

/**
 * High-level memory manager interface.
 */
export interface IMemoryManager {
  /** Remember a fact */
  remember(content: string, options?: RememberOptions): Promise<string>;

  /** Recall relevant memories for a query */
  recall(query: string, options?: RecallOptions): Promise<Memory[]>;

  /** Forget a specific memory */
  forget(id: string): Promise<void>;

  /** Update memory importance */
  reinforce(id: string): Promise<void>;

  /** Get conversation context (short-term memories) */
  getContext(maxTokens?: number): Promise<string>;

  /** Add to conversation context */
  addToContext(message: string, role: "user" | "assistant" | "system"): Promise<void>;

  /** Clear conversation context */
  clearContext(): Promise<void>;

  /** Trigger memory consolidation */
  consolidate(): Promise<ConsolidationResult>;

  /** Get memory statistics */
  getStats(): Promise<MemoryStats>;

  /** Export memories for backup */
  export(): Promise<string>;

  /** Import memories from backup */
  import(data: string): Promise<number>;
}

// ============================================================================
// Supporting Types
// ============================================================================

/**
 * Options for remembering.
 */
export interface RememberOptions {
  type?: MemoryType;
  importance?: number;
  tags?: string[];
  source?: string;
  sessionId?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Options for recalling.
 */
export interface RecallOptions {
  limit?: number;
  types?: MemoryType[];
  minImportance?: number;
  useSemanticSearch?: boolean;
  tags?: string[];
}

/**
 * Result of memory consolidation.
 */
export interface ConsolidationResult {
  /** Number of memories before consolidation */
  memoriesBefore: number;

  /** Number of memories after consolidation */
  memoriesAfter: number;

  /** Number of memories deleted */
  deleted: number;

  /** Number of memories merged */
  merged: number;

  /** Summaries created */
  summaries: string[];

  /** Time taken in ms */
  durationMs: number;
}

/**
 * Memory storage statistics.
 */
export interface MemoryStats {
  /** Total memory count */
  total: number;

  /** Count by type */
  byType: Record<MemoryType, number>;

  /** Average importance */
  averageImportance: number;

  /** Storage size estimate (bytes) */
  sizeBytes: number;

  /** Oldest memory timestamp */
  oldestAt?: number;

  /** Newest memory timestamp */
  newestAt?: number;
}

// ============================================================================
// Embedding Types
// ============================================================================

/**
 * Interface for embedding providers.
 */
export interface IEmbeddingProvider {
  /** Generate embedding for text */
  embed(text: string): Promise<number[]>;

  /** Generate embeddings for multiple texts (batch) */
  embedBatch(texts: string[]): Promise<number[][]>;

  /** Get embedding dimension */
  getDimension(): number;
}

/**
 * Cosine similarity between two vectors.
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error("Vectors must have same dimension");
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

// ============================================================================
// Memory Events
// ============================================================================

/**
 * Events emitted by the memory system.
 */
export type MemoryEventType =
  | "memory:added"
  | "memory:accessed"
  | "memory:updated"
  | "memory:deleted"
  | "memory:decayed"
  | "consolidation:start"
  | "consolidation:complete"
  | "context:updated"
  | "context:cleared";

/**
 * Memory event payload.
 */
export interface MemoryEvent {
  type: MemoryEventType;
  timestamp: number;
  data: unknown;
}

/**
 * Handler for memory events.
 */
export type MemoryEventHandler = (event: MemoryEvent) => void;
