/**
 * RAG Module
 *
 * Exports for Retrieval-Augmented Generation pipeline.
 *
 * Features:
 * - HNSW-based vector indexing for O(log n) search
 * - Hybrid search combining vector and keyword matching
 * - LLM-based reranking for improved precision
 * - Verification agent for fact-checking
 */

// Types
export type {
  Citation,
  IndexedDocument,
  RAGConfig,
  RAGQueryOptions,
  RAGQueryResult,
  SearchResult,
  VectorStore,
} from "./types";

// Vector Store (In-Memory - for development)
export { InMemoryVectorStore, createInMemoryStore } from "./vectorStore";

// HNSW Index (Production - O(log n) search)
export {
  HNSWIndex,
  createHNSWIndex,
  type HNSWConfig,
  type HNSWSearchResult,
  type DistanceMetric,
} from "./hnswIndex";

// RAG Pipeline
export { RAGPipeline, createRAGPipeline } from "./ragPipeline";

// Hybrid Search
export {
  KeywordIndex,
  HybridSearch,
  createHybridSearch,
  reciprocalRankFusion,
  type HybridSearchConfig,
} from "./hybridSearch";

// Reranker
export {
  Reranker,
  createReranker,
  type RerankerConfig,
  type RerankedResult,
  type RerankResponse,
} from "./reranker";
