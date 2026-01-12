/**
 * Hybrid Search
 *
 * Combines semantic (vector) search with keyword (BM25) search
 * for more accurate retrieval. Implements Reciprocal Rank Fusion (RRF)
 * to merge results from multiple retrieval methods.
 */

import type { DocumentChunk } from "../extraction";

/** BM25 parameters */
const BM25_K1 = 1.2;
const BM25_B = 0.75;

/** Keyword search index entry */
interface IndexEntry {
  chunkId: string;
  docId: string;
  terms: Map<string, number>; // term -> frequency
  length: number;
}

/** Hybrid search configuration */
export interface HybridSearchConfig {
  /** Weight for semantic search (0-1) */
  semanticWeight: number;
  /** Weight for keyword search (0-1) */
  keywordWeight: number;
  /** RRF constant (default: 60) */
  rrfK: number;
  /** Minimum keyword score threshold */
  minKeywordScore: number;
}

const DEFAULT_CONFIG: HybridSearchConfig = {
  semanticWeight: 0.7,
  keywordWeight: 0.3,
  rrfK: 60,
  minKeywordScore: 0.1,
};

/**
 * BM25 Keyword Index for full-text search.
 */
export class KeywordIndex {
  private readonly index = new Map<string, IndexEntry>();
  private readonly invertedIndex = new Map<string, Set<string>>(); // term -> chunkIds
  private avgDocLength = 0;
  private totalDocs = 0;

  /**
   * Add chunks to the index.
   */
  addChunks(chunks: DocumentChunk[]): void {
    for (const chunk of chunks) {
      this.addChunk(chunk);
    }
    this.updateStats();
  }

  /**
   * Add a single chunk.
   */
  private addChunk(chunk: DocumentChunk): void {
    const terms = this.tokenize(chunk.content);
    const termFreq = new Map<string, number>();

    for (const term of terms) {
      termFreq.set(term, (termFreq.get(term) || 0) + 1);

      // Update inverted index
      let chunkIds = this.invertedIndex.get(term);
      if (!chunkIds) {
        chunkIds = new Set();
        this.invertedIndex.set(term, chunkIds);
      }
      chunkIds.add(chunk.id);
    }

    this.index.set(chunk.id, {
      chunkId: chunk.id,
      docId: chunk.docId,
      terms: termFreq,
      length: terms.length,
    });
  }

  /**
   * Remove chunks by document ID.
   */
  removeByDocId(docId: string): void {
    const toRemove: string[] = [];

    for (const [chunkId, entry] of this.index) {
      if (entry.docId === docId) {
        toRemove.push(chunkId);

        // Remove from inverted index
        for (const term of entry.terms.keys()) {
          const chunkIds = this.invertedIndex.get(term);
          if (chunkIds) {
            chunkIds.delete(chunkId);
            if (chunkIds.size === 0) {
              this.invertedIndex.delete(term);
            }
          }
        }
      }
    }

    for (const chunkId of toRemove) {
      this.index.delete(chunkId);
    }

    this.updateStats();
  }

  /**
   * Search using BM25.
   */
  search(query: string, topK: number): Array<{ chunkId: string; score: number }> {
    const queryTerms = this.tokenize(query);
    const scores = new Map<string, number>();

    for (const term of queryTerms) {
      const chunkIds = this.invertedIndex.get(term);
      if (!chunkIds) {
        continue;
      }

      // Calculate IDF
      const idf = this.calculateIDF(chunkIds.size);

      for (const chunkId of chunkIds) {
        const entry = this.index.get(chunkId);
        if (!entry) {
          continue;
        }

        const tf = entry.terms.get(term) || 0;
        const score = this.calculateBM25Score(tf, entry.length, idf);

        scores.set(chunkId, (scores.get(chunkId) || 0) + score);
      }
    }

    // Sort and return top-k
    return Array.from(scores.entries())
      .map(([chunkId, score]) => ({ chunkId, score }))
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);
  }

  /**
   * Tokenize text into terms.
   */
  private tokenize(text: string): string[] {
    return text
      .toLowerCase()
      .replace(/[^\w\s\u4e00-\u9fff]/g, " ") // Keep alphanumeric and Chinese
      .split(/\s+/)
      .filter((t) => t.length > 1); // Filter short terms
  }

  /**
   * Calculate IDF (Inverse Document Frequency).
   */
  private calculateIDF(docFreq: number): number {
    return Math.log(1 + (this.totalDocs - docFreq + 0.5) / (docFreq + 0.5));
  }

  /**
   * Calculate BM25 score for a term.
   */
  private calculateBM25Score(tf: number, docLength: number, idf: number): number {
    const numerator = tf * (BM25_K1 + 1);
    const denominator = tf + BM25_K1 * (1 - BM25_B + BM25_B * (docLength / this.avgDocLength));
    return idf * (numerator / denominator);
  }

  /**
   * Update statistics.
   */
  private updateStats(): void {
    this.totalDocs = this.index.size;
    if (this.totalDocs === 0) {
      this.avgDocLength = 0;
      return;
    }

    let totalLength = 0;
    for (const entry of this.index.values()) {
      totalLength += entry.length;
    }
    this.avgDocLength = totalLength / this.totalDocs;
  }

  /**
   * Get index stats.
   */
  getStats(): { totalDocs: number; totalTerms: number; avgDocLength: number } {
    return {
      totalDocs: this.totalDocs,
      totalTerms: this.invertedIndex.size,
      avgDocLength: this.avgDocLength,
    };
  }

  /**
   * Clear the index.
   */
  clear(): void {
    this.index.clear();
    this.invertedIndex.clear();
    this.avgDocLength = 0;
    this.totalDocs = 0;
  }
}

/**
 * Reciprocal Rank Fusion (RRF) for merging ranked lists.
 *
 * RRF score = Σ 1 / (k + rank_i)
 */
export function reciprocalRankFusion(
  rankedLists: Array<Array<{ id: string; score: number }>>,
  weights: number[],
  k = 60
): Array<{ id: string; score: number }> {
  const fusedScores = new Map<string, number>();

  for (let listIdx = 0; listIdx < rankedLists.length; listIdx++) {
    const list = rankedLists[listIdx];
    const weight = weights[listIdx] || 1;

    for (let rank = 0; rank < list.length; rank++) {
      const item = list[rank];
      const rrfScore = weight / (k + rank + 1);
      fusedScores.set(item.id, (fusedScores.get(item.id) || 0) + rrfScore);
    }
  }

  return Array.from(fusedScores.entries())
    .map(([id, score]) => ({ id, score }))
    .sort((a, b) => b.score - a.score);
}

/**
 * Hybrid Search combining semantic and keyword search.
 */
export class HybridSearch {
  private readonly keywordIndex: KeywordIndex;
  private readonly config: HybridSearchConfig;
  private readonly chunkStore = new Map<string, DocumentChunk>();

  constructor(config: Partial<HybridSearchConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.keywordIndex = new KeywordIndex();
  }

  /**
   * Index chunks for both semantic and keyword search.
   */
  indexChunks(chunks: DocumentChunk[]): void {
    // Store chunks
    for (const chunk of chunks) {
      this.chunkStore.set(chunk.id, chunk);
    }

    // Build keyword index
    this.keywordIndex.addChunks(chunks);
  }

  /**
   * Remove chunks by document ID.
   */
  removeByDocId(docId: string): void {
    this.keywordIndex.removeByDocId(docId);

    for (const [id, chunk] of this.chunkStore) {
      if (chunk.docId === docId) {
        this.chunkStore.delete(id);
      }
    }
  }

  /**
   * Perform hybrid search.
   *
   * @param query - Search query
   * @param semanticResults - Results from semantic search
   * @param topK - Number of results to return
   */
  search(
    query: string,
    semanticResults: Array<{ id: string; similarity: number }>,
    topK: number
  ): Array<{ chunkId: string; score: number; sources: string[] }> {
    // Get keyword results
    const keywordResults = this.keywordIndex.search(query, topK * 2);

    // Normalize scores
    const normalizedSemantic = this.normalizeScores(
      semanticResults.map((r) => ({ id: r.id, score: r.similarity }))
    );
    const normalizedKeyword = this.normalizeScores(
      keywordResults.map((r) => ({ id: r.chunkId, score: r.score }))
    );

    // Apply RRF
    const fused = reciprocalRankFusion(
      [normalizedSemantic, normalizedKeyword],
      [this.config.semanticWeight, this.config.keywordWeight],
      this.config.rrfK
    );

    // Build result with source attribution
    return fused.slice(0, topK).map((item) => {
      const sources: string[] = [];
      if (normalizedSemantic.some((r) => r.id === item.id)) {
        sources.push("semantic");
      }
      if (normalizedKeyword.some((r) => r.id === item.id)) {
        sources.push("keyword");
      }
      return {
        chunkId: item.id,
        score: item.score,
        sources,
      };
    });
  }

  /**
   * Normalize scores to 0-1 range.
   */
  private normalizeScores(
    results: Array<{ id: string; score: number }>
  ): Array<{ id: string; score: number }> {
    if (results.length === 0) {
      return [];
    }

    const maxScore = Math.max(...results.map((r) => r.score));
    const minScore = Math.min(...results.map((r) => r.score));
    const range = maxScore - minScore || 1;

    return results.map((r) => ({
      id: r.id,
      score: (r.score - minScore) / range,
    }));
  }

  /**
   * Get chunk by ID.
   */
  getChunk(chunkId: string): DocumentChunk | undefined {
    return this.chunkStore.get(chunkId);
  }

  /**
   * Get stats.
   */
  getStats(): {
    totalChunks: number;
    keywordStats: ReturnType<KeywordIndex["getStats"]>;
  } {
    return {
      totalChunks: this.chunkStore.size,
      keywordStats: this.keywordIndex.getStats(),
    };
  }

  /**
   * Clear all data.
   */
  clear(): void {
    this.chunkStore.clear();
    this.keywordIndex.clear();
  }
}

/**
 * Create a hybrid search instance.
 */
export function createHybridSearch(config: Partial<HybridSearchConfig> = {}): HybridSearch {
  return new HybridSearch(config);
}
