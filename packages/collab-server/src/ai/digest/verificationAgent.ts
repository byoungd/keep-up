/**
 * Verification Agent
 *
 * Validates that digest cards have proper evidence backing their claims.
 * Implements citation enforcement as per Track 2 P0 requirements.
 *
 * STRICT RULE: No digest card can be generated without valid source attribution.
 */

import type { AIGateway, AIRequestOptions } from "../gateway";
import type { RAGPipeline } from "../rag/ragPipeline";
import type { Citation } from "../rag/types";
import type {
  ConfidenceLevel,
  ContentItem,
  DigestCard,
  VerificationIssue,
  VerificationResult,
} from "./types";

// ─────────────────────────────────────────────────────────────────────────────
// Configuration
// ─────────────────────────────────────────────────────────────────────────────

export interface VerificationAgentConfig {
  /** Minimum required citations per card */
  minCitations: number;
  /** Minimum confidence threshold (0-1) */
  minConfidence: number;
  /** Maximum claims to verify per card */
  maxClaimsPerCard: number;
  /** Similarity threshold for evidence matching (0-1) */
  similarityThreshold: number;
  /** Whether to use LLM for semantic verification */
  useLLMVerification: boolean;
}

const DEFAULT_CONFIG: VerificationAgentConfig = {
  minCitations: 1,
  minConfidence: 0.7,
  maxClaimsPerCard: 5,
  similarityThreshold: 0.75,
  useLLMVerification: true,
};

// ─────────────────────────────────────────────────────────────────────────────
// Verification Agent
// ─────────────────────────────────────────────────────────────────────────────

export class VerificationAgent {
  private readonly config: VerificationAgentConfig;
  private readonly gateway: AIGateway;
  private readonly rag: RAGPipeline;

  constructor(gateway: AIGateway, rag: RAGPipeline, config: Partial<VerificationAgentConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.gateway = gateway;
    this.rag = rag;
  }

  /**
   * Verify a digest card's claims against source content
   */
  async verify(
    card: DigestCard,
    sourceItems: ContentItem[],
    options: AIRequestOptions
  ): Promise<VerificationResult> {
    const issues: VerificationIssue[] = [];
    const verifiedCitations: Citation[] = [];

    // Step 1: Check minimum source requirement
    if (card.sourceItemIds.length < this.config.minCitations) {
      issues.push({
        type: "missing_source",
        description: `Card requires at least ${this.config.minCitations} source(s), has ${card.sourceItemIds.length}`,
        severity: "error",
      });
    }

    // Step 2: Extract claims from the card
    const claims = await this.extractClaims(card, options);

    // Step 3: Verify each claim has evidence
    for (const claim of claims) {
      const evidence = await this.findEvidence(claim, sourceItems, options);

      if (evidence.found) {
        verifiedCitations.push(evidence.citation);
      } else {
        issues.push({
          type: evidence.issueType,
          description: evidence.reason,
          affectedText: claim,
          severity: evidence.issueType === "hallucination" ? "error" : "warning",
        });
      }
    }

    // Step 4: Calculate confidence
    const confidence = this.calculateConfidence(claims.length, verifiedCitations.length, issues);

    // Step 5: Determine pass/fail
    const criticalIssues = issues.filter((i) => i.severity === "error");
    const passed =
      criticalIssues.length === 0 &&
      confidence !== "low" &&
      verifiedCitations.length >= this.config.minCitations;

    return {
      cardId: card.id,
      passed,
      confidence,
      issues,
      verifiedCitations,
    };
  }

  /**
   * Batch verify multiple cards
   */
  async verifyBatch(
    cards: DigestCard[],
    sourceItems: ContentItem[],
    options: AIRequestOptions
  ): Promise<Map<string, VerificationResult>> {
    const results = new Map<string, VerificationResult>();

    // Process in parallel with concurrency limit
    const batchSize = 5;
    for (let i = 0; i < cards.length; i += batchSize) {
      const batch = cards.slice(i, i + batchSize);
      const batchResults = await Promise.all(
        batch.map((card) => this.verify(card, sourceItems, options))
      );

      for (const result of batchResults) {
        results.set(result.cardId, result);
      }
    }

    return results;
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Internal Methods
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Extract verifiable claims from a card's content
   */
  private async extractClaims(card: DigestCard, _options: AIRequestOptions): Promise<string[]> {
    if (!this.config.useLLMVerification) {
      // Simple extraction: split by sentences
      return this.splitIntoSentences(card.summary).slice(0, this.config.maxClaimsPerCard);
    }

    // TODO: Use LLM to extract factual claims
    // For now, use simple sentence splitting
    return this.splitIntoSentences(card.summary).slice(0, this.config.maxClaimsPerCard);
  }

  /**
   * Find evidence for a claim in source content
   */
  private async findEvidence(
    claim: string,
    sourceItems: ContentItem[],
    _options: AIRequestOptions
  ): Promise<{
    found: boolean;
    citation: Citation;
    issueType: VerificationIssue["type"];
    reason: string;
  }> {
    // Search for similar content in sources
    const _sourceText = sourceItems.map((item) => item.content).join("\n\n");

    // Use simple string matching for now
    // TODO: Use RAG pipeline for semantic search
    const matchResult = this.findBestMatch(claim, sourceItems);

    if (matchResult.similarity >= this.config.similarityThreshold) {
      return {
        found: true,
        citation: {
          index: 0,
          docId: matchResult.itemId,
          title: matchResult.itemTitle,
          excerpt: matchResult.excerpt,
          confidence: matchResult.similarity,
        },
        issueType: "missing_source",
        reason: "",
      };
    }

    // Check if this might be a hallucination vs weak evidence
    if (matchResult.similarity < 0.3) {
      return {
        found: false,
        citation: this.emptyCitation(),
        issueType: "hallucination",
        reason: `No evidence found for claim: "${claim.slice(0, 50)}..."`,
      };
    }

    return {
      found: false,
      citation: this.emptyCitation(),
      issueType: "weak_evidence",
      reason: `Weak evidence (${Math.round(matchResult.similarity * 100)}%) for claim: "${claim.slice(0, 50)}..."`,
    };
  }

  /**
   * Find the best matching source for a claim
   */
  private findBestMatch(
    claim: string,
    sourceItems: ContentItem[]
  ): {
    similarity: number;
    itemId: string;
    itemTitle: string;
    excerpt: string;
  } {
    let bestMatch = {
      similarity: 0,
      itemId: "",
      itemTitle: "",
      excerpt: "",
    };

    const claimWords = this.tokenize(claim);

    for (const item of sourceItems) {
      const sentences = this.splitIntoSentences(item.content);

      for (const sentence of sentences) {
        const similarity = this.calculateJaccardSimilarity(claimWords, this.tokenize(sentence));

        if (similarity > bestMatch.similarity) {
          bestMatch = {
            similarity,
            itemId: item.id,
            itemTitle: item.title,
            excerpt: sentence,
          };
        }
      }
    }

    return bestMatch;
  }

  /**
   * Calculate Jaccard similarity between two token sets
   */
  private calculateJaccardSimilarity(a: Set<string>, b: Set<string>): number {
    const intersection = new Set([...a].filter((x) => b.has(x)));
    const union = new Set([...a, ...b]);
    return union.size > 0 ? intersection.size / union.size : 0;
  }

  /**
   * Tokenize text into words
   */
  private tokenize(text: string): Set<string> {
    return new Set(
      text
        .toLowerCase()
        .replace(/[^\w\s]/g, "")
        .split(/\s+/)
        .filter((word) => word.length > 2)
    );
  }

  /**
   * Split text into sentences
   */
  private splitIntoSentences(text: string): string[] {
    return text
      .split(/[.!?]+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 10);
  }

  /**
   * Calculate confidence level based on verification results
   */
  private calculateConfidence(
    totalClaims: number,
    verifiedCount: number,
    issues: VerificationIssue[]
  ): ConfidenceLevel {
    if (totalClaims === 0) {
      return "low";
    }

    const verificationRate = verifiedCount / totalClaims;
    const hasHallucinations = issues.some((i) => i.type === "hallucination");
    const errorCount = issues.filter((i) => i.severity === "error").length;

    if (hasHallucinations || errorCount > 0) {
      return "low";
    }

    if (verificationRate >= 0.8) {
      return "high";
    }

    if (verificationRate >= 0.5) {
      return "medium";
    }

    return "low";
  }

  /**
   * Create an empty citation placeholder
   */
  private emptyCitation(): Citation {
    return {
      index: -1,
      docId: "",
      excerpt: "",
      confidence: 0,
    };
  }
}
