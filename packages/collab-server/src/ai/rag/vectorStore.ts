/**
 * In-Memory Vector Store
 *
 * Simple in-memory vector store for development and small datasets.
 * For production, replace with a proper vector database (Pinecone, Weaviate, etc.)
 */

import type { ChunkEmbedding } from "../extraction";
import { cosineSimilarity } from "../extraction";
import type { VectorStore } from "./types";

/**
 * In-memory vector store implementation.
 *
 * Suitable for:
 * - Development and testing
 * - Small datasets (< 100k embeddings)
 * - Single-node deployments
 *
 * For production, use a dedicated vector database.
 */
export class InMemoryVectorStore implements VectorStore {
  readonly name = "in-memory";

  private embeddings: Map<string, ChunkEmbedding> = new Map();
  private docIndex: Map<string, Set<string>> = new Map(); // docId -> chunkIds

  /**
   * Add embeddings to store.
   */
  async add(embeddings: ChunkEmbedding[]): Promise<void> {
    for (const emb of embeddings) {
      this.embeddings.set(emb.chunkId, emb);

      // Update doc index
      let docChunks = this.docIndex.get(emb.docId);
      if (!docChunks) {
        docChunks = new Set();
        this.docIndex.set(emb.docId, docChunks);
      }
      docChunks.add(emb.chunkId);
    }
  }

  /**
   * Search for similar embeddings.
   */
  async search(
    query: number[],
    options: { topK: number; filter?: { docIds?: string[] } }
  ): Promise<Array<{ id: string; similarity: number }>> {
    const candidates = this.getCandidates(options.filter);
    const results = this.rankCandidates(query, candidates);
    return results.slice(0, options.topK);
  }

  private getCandidates(filter?: { docIds?: string[] }): ChunkEmbedding[] {
    if (!filter?.docIds || filter.docIds.length === 0) {
      return Array.from(this.embeddings.values());
    }

    const candidates: ChunkEmbedding[] = [];
    for (const docId of filter.docIds) {
      const chunkIds = this.docIndex.get(docId);
      if (!chunkIds) {
        continue;
      }
      for (const chunkId of chunkIds) {
        const emb = this.embeddings.get(chunkId);
        if (emb) {
          candidates.push(emb);
        }
      }
    }
    return candidates;
  }

  private rankCandidates(
    query: number[],
    candidates: ChunkEmbedding[]
  ): Array<{ id: string; similarity: number }> {
    const results: Array<{ id: string; similarity: number }> = [];
    for (const emb of candidates) {
      const similarity = cosineSimilarity(query, emb.embedding);
      results.push({ id: emb.chunkId, similarity });
    }
    results.sort((a, b) => b.similarity - a.similarity);
    return results;
  }

  /**
   * Delete embeddings by chunk IDs.
   */
  async delete(chunkIds: string[]): Promise<void> {
    for (const chunkId of chunkIds) {
      const emb = this.embeddings.get(chunkId);
      if (emb) {
        this.embeddings.delete(chunkId);
        const docChunks = this.docIndex.get(emb.docId);
        if (docChunks) {
          docChunks.delete(chunkId);
          if (docChunks.size === 0) {
            this.docIndex.delete(emb.docId);
          }
        }
      }
    }
  }

  /**
   * Delete all embeddings for a document.
   */
  async deleteByDocId(docId: string): Promise<void> {
    const chunkIds = this.docIndex.get(docId);
    if (chunkIds) {
      for (const chunkId of chunkIds) {
        this.embeddings.delete(chunkId);
      }
      this.docIndex.delete(docId);
    }
  }

  /**
   * Get embedding by chunk ID.
   */
  async get(chunkId: string): Promise<ChunkEmbedding | null> {
    return this.embeddings.get(chunkId) || null;
  }

  /**
   * Count embeddings.
   */
  async count(filter?: { docId?: string }): Promise<number> {
    if (filter?.docId) {
      return this.docIndex.get(filter.docId)?.size || 0;
    }
    return this.embeddings.size;
  }

  /**
   * Clear all embeddings.
   */
  async clear(): Promise<void> {
    this.embeddings.clear();
    this.docIndex.clear();
  }

  /**
   * Get all document IDs.
   */
  getDocIds(): string[] {
    return Array.from(this.docIndex.keys());
  }

  /**
   * Get stats.
   */
  getStats(): { totalEmbeddings: number; totalDocuments: number } {
    return {
      totalEmbeddings: this.embeddings.size,
      totalDocuments: this.docIndex.size,
    };
  }
}

/**
 * Create an in-memory vector store.
 */
export function createInMemoryStore(): InMemoryVectorStore {
  return new InMemoryVectorStore();
}
