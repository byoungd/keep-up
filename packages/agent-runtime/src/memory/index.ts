/**
 * Memory Module
 *
 * Persistent cross-session memory system with semantic search.
 * Provides short-term context and long-term knowledge storage.
 *
 * Two implementations available:
 * 1. MemoryManager - Custom lightweight implementation
 * 2. Mem0MemoryAdapter - Mem0 cloud/oss integration (recommended)
 */

// Memory cache wrappers
export { CachedMemoryStore, createCachedMemoryStore } from "./cachedMemoryStore";
export {
  type MemoryCacheConfig,
  type ResolvedMemoryCacheConfig,
  resolveMemoryCacheConfig,
} from "./cacheTypes";
export { CachedEmbeddingProvider, createCachedEmbeddingProvider } from "./embeddingCache";
// Mem0 Adapter (recommended for production)
export {
  createMem0MemoryAdapter,
  type Mem0Config,
  type Mem0Memory,
  Mem0MemoryAdapter,
  MemoryClient,
} from "./mem0Adapter";
// Memory Manager (legacy)
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
