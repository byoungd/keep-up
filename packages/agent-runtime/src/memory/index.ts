/**
 * Memory Module
 *
 * Persistent cross-session memory system with semantic search.
 * Provides short-term context and long-term knowledge storage.
 */

// Types
export type {
  ConsolidationResult,
  IEmbeddingProvider,
  IMemoryManager,
  IMemoryStore,
  Memory,
  MemoryConfig,
  MemoryEvent,
  MemoryEventHandler,
  MemoryEventType,
  MemoryQuery,
  MemorySearchResult,
  MemoryStats,
  MemoryType,
  RecallOptions,
  RememberOptions,
} from "./types";

export { DEFAULT_MEMORY_CONFIG, cosineSimilarity } from "./types";

// Memory Store
export { InMemoryStore, createInMemoryStore } from "./memoryStore";

// Memory Manager
export {
  MemoryManager,
  createMemoryManager,
  createMemoryManagerWithStore,
} from "./memoryManager";

// Vector Index
export type { VectorIndexConfig, VectorSearchResult } from "./vectorIndex";
export {
  MemoryVectorIndex,
  MockEmbeddingProvider,
  VectorIndex,
  createMemoryVectorIndex,
  createMockEmbeddingProvider,
  createVectorIndex,
} from "./vectorIndex";
