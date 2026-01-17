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

// HNSW Index (Production - O(log n) search)
export {
  createHNSWIndex,
  type DistanceMetric,
  type HNSWConfig,
  HNSWIndex,
  type HNSWSearchResult,
} from "./hnswIndex";
// Hybrid Search
export {
  createHybridSearch,
  HybridSearch,
  type HybridSearchConfig,
  KeywordIndex,
  reciprocalRankFusion,
} from "./hybridSearch";
// RAG Pipeline
export { createRAGPipeline, RAGPipeline } from "./ragPipeline";
// Reranker
export {
  createReranker,
  type RerankedResult,
  Reranker,
  type RerankerConfig,
  type RerankResponse,
} from "./reranker";
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
export { createInMemoryStore, InMemoryVectorStore } from "./vectorStore";
