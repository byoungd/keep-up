/**
 * RAG (Retrieval-Augmented Generation) Types
 *
 * Type definitions for the RAG query pipeline.
 */

import type { DataAccessPolicy } from "@keepup/core";
import type { ChunkEmbedding, DocumentChunk } from "../extraction";

/** Search result with relevance */
export interface SearchResult {
  /** Chunk that matched */
  chunk: DocumentChunk;
  /** Embedding (if available) */
  embedding?: ChunkEmbedding;
  /** Similarity score (0-1) */
  similarity: number;
  /** Rank in results */
  rank: number;
}

/** RAG query options */
export interface RAGQueryOptions {
  /** Number of results to retrieve */
  topK?: number;
  /** Minimum similarity threshold (0-1) */
  minSimilarity?: number;
  /** Filter by document IDs */
  docIds?: string[];
  /** Include metadata in response */
  includeMetadata?: boolean;
  /** Maximum context tokens to include */
  maxContextTokens?: number;
  /** Whether to rerank results */
  rerank?: boolean;
  /** Optional data access policy for redaction/limits */
  dataAccessPolicy?: DataAccessPolicy;
}

/** RAG query result */
export interface RAGQueryResult {
  /** Query text */
  query: string;
  /** Retrieved chunks */
  results: SearchResult[];
  /** Total chunks searched */
  totalSearched: number;
  /** Generated answer (if requested) */
  answer?: string;
  /** Citations from sources */
  citations: Citation[];
  /** Token usage */
  usage: {
    retrievalTokens: number;
    generationTokens: number;
  };
  /** Processing time */
  processingTimeMs: number;
}

/** Citation from source document */
export interface Citation {
  /** Citation index (for reference in text) */
  index: number;
  /** Document ID */
  docId: string;
  /** Document title */
  title?: string;
  /** Excerpt from source */
  excerpt: string;
  /** Location in source */
  location?: {
    page?: number;
    section?: string;
    offset?: { start: number; end: number };
  };
  /** Confidence in citation relevance */
  confidence: number;
}

/** RAG configuration */
export interface RAGConfig {
  /** Default number of results */
  defaultTopK?: number;
  /** Default minimum similarity */
  defaultMinSimilarity?: number;
  /** Maximum context tokens for generation */
  maxContextTokens?: number;
  /** System prompt for RAG answers */
  systemPrompt?: string;
  /** Whether to include citations by default */
  includeCitations?: boolean;
  /** Temperature for generation */
  temperature?: number;
}

/** Vector store interface */
export interface VectorStore {
  /** Store name */
  readonly name: string;

  /** Add embeddings to store */
  add(embeddings: ChunkEmbedding[]): Promise<void>;

  /** Search for similar embeddings */
  search(
    query: number[],
    options: { topK: number; filter?: { docIds?: string[] } }
  ): Promise<Array<{ id: string; similarity: number }>>;

  /** Delete embeddings by chunk IDs */
  delete(chunkIds: string[]): Promise<void>;

  /** Delete all embeddings for a document */
  deleteByDocId(docId: string): Promise<void>;

  /** Get embedding by chunk ID */
  get(chunkId: string): Promise<ChunkEmbedding | null>;

  /** Count embeddings */
  count(filter?: { docId?: string }): Promise<number>;

  /** Clear all embeddings */
  clear(): Promise<void>;
}

/** Indexed document metadata */
export interface IndexedDocument {
  /** Document ID */
  docId: string;
  /** Document title */
  title?: string;
  /** Number of chunks */
  chunkCount: number;
  /** Total tokens */
  totalTokens: number;
  /** Last indexed timestamp */
  indexedAt: number;
  /** Source URL (if applicable) */
  sourceUrl?: string;
}
