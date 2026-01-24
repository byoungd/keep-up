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
export type {
  MemoryConsolidationConfig,
  WorkingMemoryConsolidationResult,
} from "./consolidation/memoryManager";
// Working memory + consolidation
export {
  ConsolidationMemoryManager,
  createMemoryEntry,
} from "./consolidation/memoryManager";
export { CachedEmbeddingProvider, createCachedEmbeddingProvider } from "./embeddingCache";
export type {
  LessonSearchResult,
  LessonStoreConfig,
  LessonStoreQuery,
} from "./lessons/lessonStore";
// Lessons
export { createLessonStore, LessonStore } from "./lessons/lessonStore";
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
export {
  createSemanticMemoryStore,
  mergeSemanticMemoryRecords,
  SemanticMemoryStore,
  toSemanticMemoryRecord,
} from "./semantic/semanticMemoryStore";
export type {
  EmbeddingProvider,
  InMemoryVectorStoreConfig,
  SqliteVectorStoreConfig,
  VectorSearchOptions,
  VectorSearchResult as VectorStoreSearchResult,
  VectorStore,
  VectorStoreEntry,
} from "./semantic/vectorStore";
// Vector store
export { InMemoryVectorStore, SqliteVectorStore } from "./semantic/vectorStore";

// Types
export type {
  ConsolidationResult,
  IEmbeddingProvider,
  IMemoryManager,
  IMemoryStore,
  Lesson,
  LessonProfile,
  LessonScope,
  LessonSource,
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
  SemanticMemoryPolicy,
  SemanticMemoryQuery,
  SemanticMemoryRecord,
  SemanticMemorySearchResult,
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
export type { MemoryEntry, MemoryEntryType, SessionMemoryConfig } from "./working/sessionMemory";
export { SessionMemory } from "./working/sessionMemory";
