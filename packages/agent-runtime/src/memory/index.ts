/**
 * Memory Module
 *
 * Persistent cross-session memory system with semantic search.
 * Provides short-term context and long-term knowledge storage.
 */

// Memory Manager
export {
  createMemoryManager,
  createMemoryManagerWithStore,
  MemoryManager,
} from "./memoryManager";
// Memory Store
export { createInMemoryStore, InMemoryStore } from "./memoryStore";
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
export { cosineSimilarity, DEFAULT_MEMORY_CONFIG } from "./types";

// Vector Index
export type { VectorIndexConfig, VectorSearchResult } from "./vectorIndex";
export {
  createMemoryVectorIndex,
  createMockEmbeddingProvider,
  createVectorIndex,
  MemoryVectorIndex,
  MockEmbeddingProvider,
  VectorIndex,
} from "./vectorIndex";
