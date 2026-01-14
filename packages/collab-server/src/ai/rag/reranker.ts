/**
 * Reranker Service
 *
 * Re-ranks retrieved chunks using cross-encoder models for higher precision.
 * Improves upon bi-encoder (embedding) retrieval with query-document interaction.
 *
 * Features:
 * - LLM-based reranking with structured scoring
 * - Batch processing for efficiency
 * - Configurable scoring criteria
 * - Fallback to similarity-based ranking
 */

import type { Message } from "@ku0/ai-core";
import type { AIGateway } from "../gateway";
import type { SearchResult } from "./types";

// ============================================================================
// Types
// ============================================================================

/** Reranker configuration */
export interface RerankerConfig {
  /** Maximum chunks to rerank (default: 20) */
  maxChunks: number;
  /** Batch size for LLM calls (default: 5) */
  batchSize: number;
  /** Temperature for LLM scoring (default: 0) */
  temperature: number;
  /** Minimum score threshold (0-1, default: 0.3) */
  minScore: number;
  /** Whether to use LLM reranking (default: true, falls back to heuristic) */
  useLLM: boolean;
  /** Timeout for LLM calls in ms (default: 10000) */
  timeoutMs: number;
}

/** Reranked result */
export interface RerankedResult {
  /** Original search result */
  result: SearchResult;
  /** Reranked score (0-1) */
  score: number;
  /** New rank after reranking */
  newRank: number;
  /** Explanation of relevance */
  explanation?: string;
}

/** Reranking response */
export interface RerankResponse {
  /** Reranked results */
  results: RerankedResult[];
  /** Processing time in ms */
  processingTimeMs: number;
  /** Method used */
  method: "llm" | "heuristic" | "similarity";
  /** Total tokens used (if LLM) */
  tokensUsed?: number;
}

// ============================================================================
// Default Configuration
// ============================================================================

const DEFAULT_CONFIG: RerankerConfig = {
  maxChunks: 20,
  batchSize: 5,
  temperature: 0,
  minScore: 0.3,
  useLLM: true,
  timeoutMs: 10000,
};

// ============================================================================
// Reranker Implementation
// ============================================================================

/**
 * Reranker Service
 *
 * Re-ranks retrieved chunks for improved precision using LLM or heuristics.
 */
export class Reranker {
  private readonly gateway: AIGateway;
  private readonly config: RerankerConfig;

  constructor(gateway: AIGateway, config: Partial<RerankerConfig> = {}) {
    this.gateway = gateway;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Rerank search results based on query relevance.
   */
  async rerank(
    query: string,
    results: SearchResult[],
    userId: string,
    options?: Partial<RerankerConfig>
  ): Promise<RerankResponse> {
    const startTime = performance.now();
    const config = { ...this.config, ...options };

    // Limit chunks to rerank
    const toRerank = results.slice(0, config.maxChunks);

    if (toRerank.length === 0) {
      return {
        results: [],
        processingTimeMs: performance.now() - startTime,
        method: "similarity",
      };
    }

    // Try LLM reranking if enabled
    if (config.useLLM) {
      try {
        const llmResults = await this.rerankWithLLM(query, toRerank, userId, config);
        return {
          ...llmResults,
          processingTimeMs: performance.now() - startTime,
        };
      } catch (error) {
        console.warn("[Reranker] LLM reranking failed, falling back to heuristic:", error);
      }
    }

    // Fallback to heuristic reranking
    const heuristicResults = this.rerankWithHeuristics(query, toRerank);
    return {
      results: heuristicResults,
      processingTimeMs: performance.now() - startTime,
      method: "heuristic",
    };
  }

  /**
   * Rerank using LLM for cross-encoder-like scoring.
   */
  private async rerankWithLLM(
    query: string,
    results: SearchResult[],
    userId: string,
    config: RerankerConfig
  ): Promise<Omit<RerankResponse, "processingTimeMs">> {
    const scored: RerankedResult[] = [];
    let totalTokens = 0;

    // Process in batches
    for (let i = 0; i < results.length; i += config.batchSize) {
      const batch = results.slice(i, i + config.batchSize);
      const batchResults = await this.scoreBatch(query, batch, userId, config);
      scored.push(...batchResults.results);
      totalTokens += batchResults.tokens;
    }

    // Sort by score descending
    scored.sort((a, b) => b.score - a.score);

    // Assign new ranks and filter by threshold
    const filtered = scored
      .filter((r) => r.score >= config.minScore)
      .map((r, index) => ({
        ...r,
        newRank: index + 1,
      }));

    return {
      results: filtered,
      method: "llm",
      tokensUsed: totalTokens,
    };
  }

  /**
   * Score a batch of chunks using LLM.
   */
  private async scoreBatch(
    query: string,
    results: SearchResult[],
    userId: string,
    config: RerankerConfig
  ): Promise<{ results: RerankedResult[]; tokens: number }> {
    const systemPrompt = `You are a relevance scoring expert. Score how well each document chunk answers the given query.

For each chunk, provide:
1. A relevance score from 0.0 to 1.0 (where 1.0 is perfectly relevant)
2. A brief explanation (one sentence)

Output format (JSON array):
[
  {"id": "chunk_id", "score": 0.85, "explanation": "Directly addresses the query topic..."},
  ...
]

Scoring criteria:
- 0.9-1.0: Directly and completely answers the query
- 0.7-0.9: Highly relevant, addresses main aspects
- 0.5-0.7: Partially relevant, some useful information
- 0.3-0.5: Tangentially related
- 0.0-0.3: Not relevant`;

    const chunksText = results
      .map((r, i) => `[${i}] ID: ${r.chunk.id}\n${r.chunk.content.slice(0, 500)}...`)
      .join("\n\n---\n\n");

    const messages: Message[] = [
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content: `Query: "${query}"\n\nChunks to score:\n${chunksText}`,
      },
    ];

    const response = await this.gateway.complete(messages, {
      userId,
      temperature: config.temperature,
      maxTokens: 1000,
    });

    // Parse LLM response
    const scores = this.parseScores(response.content, results);

    return {
      results: scores,
      tokens: response.usage?.totalTokens ?? 0,
    };
  }

  /**
   * Parse LLM scoring response.
   */
  private parseScores(content: string, results: SearchResult[]): RerankedResult[] {
    try {
      // Try to extract JSON from response
      const jsonMatch = content.match(/\[[\s\S]*\]/);
      if (!jsonMatch) {
        throw new Error("No JSON array found in response");
      }

      const parsed = JSON.parse(jsonMatch[0]) as Array<{
        id?: string;
        score?: number;
        explanation?: string;
      }>;

      // Map parsed scores to results
      const scoreMap = new Map<string, { score: number; explanation?: string }>();
      for (const item of parsed) {
        if (item.id && typeof item.score === "number") {
          scoreMap.set(item.id, {
            score: Math.max(0, Math.min(1, item.score)),
            explanation: item.explanation,
          });
        }
      }

      // Match with results (by index or ID)
      return results.map((result, index) => {
        const byId = scoreMap.get(result.chunk.id);
        const byIndex = parsed[index];

        const score =
          byId?.score ?? (typeof byIndex?.score === "number" ? byIndex.score : result.similarity);
        const explanation = byId?.explanation ?? byIndex?.explanation;

        return {
          result,
          score,
          newRank: index + 1,
          explanation,
        };
      });
    } catch {
      // Fallback: use original similarity scores
      return results.map((result, index) => ({
        result,
        score: result.similarity,
        newRank: index + 1,
      }));
    }
  }

  /**
   * Rerank using heuristic scoring (no LLM).
   */
  private rerankWithHeuristics(query: string, results: SearchResult[]): RerankedResult[] {
    const queryTokens = this.tokenize(query);
    const querySet = new Set(queryTokens);

    const scored = results.map((result) => {
      const contentTokens = this.tokenize(result.chunk.content);
      const titleTokens = result.chunk.metadata.sectionTitle
        ? this.tokenize(result.chunk.metadata.sectionTitle)
        : [];

      // Calculate various signals
      const contentOverlap = this.jaccardSimilarity(querySet, new Set(contentTokens));
      const titleOverlap = this.jaccardSimilarity(querySet, new Set(titleTokens));
      const exactMatchBonus = this.hasExactMatch(query, result.chunk.content) ? 0.2 : 0;
      const positionBonus = result.chunk.startOffset === 0 ? 0.1 : 0;

      // Combine signals
      const heuristicScore =
        result.similarity * 0.4 +
        contentOverlap * 0.3 +
        titleOverlap * 0.15 +
        exactMatchBonus +
        positionBonus;

      return {
        result,
        score: Math.min(1, heuristicScore),
        newRank: 0,
      };
    });

    // Sort and assign ranks
    scored.sort((a, b) => b.score - a.score);
    return scored.map((s, index) => ({
      ...s,
      newRank: index + 1,
    }));
  }

  /**
   * Simple tokenization.
   */
  private tokenize(text: string): string[] {
    return text
      .toLowerCase()
      .replace(/[^\w\s]/g, " ")
      .split(/\s+/)
      .filter((t) => t.length > 2);
  }

  /**
   * Jaccard similarity between two sets.
   */
  private jaccardSimilarity(a: Set<string>, b: Set<string>): number {
    if (a.size === 0 && b.size === 0) {
      return 0;
    }

    let intersection = 0;
    for (const item of a) {
      if (b.has(item)) {
        intersection++;
      }
    }

    const union = a.size + b.size - intersection;
    return union > 0 ? intersection / union : 0;
  }

  /**
   * Check for exact query match in content.
   */
  private hasExactMatch(query: string, content: string): boolean {
    return content.toLowerCase().includes(query.toLowerCase());
  }
}

/**
 * Create a reranker instance.
 */
export function createReranker(gateway: AIGateway, config: Partial<RerankerConfig> = {}): Reranker {
  return new Reranker(gateway, config);
}
