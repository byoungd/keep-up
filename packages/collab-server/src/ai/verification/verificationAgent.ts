/**
 * Verification Agent
 *
 * AI-powered fact-checking and content verification using RAG.
 * Verifies claims against indexed knowledge base with citation support.
 *
 * Features:
 * - Claim extraction from content
 * - Evidence retrieval via RAG pipeline
 * - Verification scoring with confidence levels
 * - Citation generation for verified claims
 * - Batch verification for efficiency
 */

import type { Message } from "@keepup/ai-core";
import type { AIGateway } from "../gateway";
import type { Citation, RAGPipeline, SearchResult } from "../rag";

// ============================================================================
// Types
// ============================================================================

/** Verification status */
export type VerificationStatus =
  | "verified"
  | "partially_verified"
  | "unverified"
  | "contradicted"
  | "insufficient_evidence";

/** Confidence level */
export type ConfidenceLevel = "high" | "medium" | "low";

/** Extracted claim */
export interface Claim {
  /** Claim ID */
  id: string;
  /** The claim text */
  text: string;
  /** Position in source content */
  position: { start: number; end: number };
  /** Claim type */
  type: "factual" | "statistical" | "quote" | "definition" | "opinion";
  /** Entities mentioned */
  entities: string[];
}

/** Verification result for a single claim */
export interface ClaimVerification {
  /** The claim being verified */
  claim: Claim;
  /** Verification status */
  status: VerificationStatus;
  /** Confidence level */
  confidence: ConfidenceLevel;
  /** Confidence score (0-1) */
  confidenceScore: number;
  /** Supporting evidence */
  evidence: Evidence[];
  /** Citations */
  citations: Citation[];
  /** Explanation of verification result */
  explanation: string;
  /** Suggested correction (if contradicted) */
  correction?: string;
}

/** Evidence item */
export interface Evidence {
  /** Evidence text */
  text: string;
  /** Source chunk ID */
  sourceChunkId: string;
  /** Source document ID */
  sourceDocId: string;
  /** Relevance score */
  relevance: number;
  /** Whether it supports or contradicts the claim */
  relationship: "supports" | "contradicts" | "neutral";
}

/** Verification request */
export interface VerificationRequest {
  /** Content to verify */
  content: string;
  /** Optional: specific claims to verify (if not provided, claims are extracted) */
  claims?: Claim[];
  /** Optional: filter to specific documents */
  docIds?: string[];
  /** Verification depth */
  depth?: "quick" | "thorough" | "exhaustive";
}

/** Verification response */
export interface VerificationResponse {
  /** Extracted/provided claims */
  claims: Claim[];
  /** Verification results */
  verifications: ClaimVerification[];
  /** Overall verification summary */
  summary: {
    totalClaims: number;
    verified: number;
    partiallyVerified: number;
    unverified: number;
    contradicted: number;
    insufficientEvidence: number;
    overallConfidence: ConfidenceLevel;
  };
  /** Processing time in ms */
  processingTimeMs: number;
  /** Tokens used */
  tokensUsed: number;
}

/** Verification agent configuration */
export interface VerificationAgentConfig {
  /** Maximum claims to verify in one request (default: 10) */
  maxClaims: number;
  /** Evidence retrieval top-k (default: 5) */
  evidenceTopK: number;
  /** Minimum evidence similarity threshold (default: 0.6) */
  minEvidenceSimilarity: number;
  /** Temperature for LLM calls (default: 0.1) */
  temperature: number;
  /** Enable claim extraction (default: true) */
  extractClaims: boolean;
  /** Enable reranking of evidence (default: true) */
  rerankEvidence: boolean;
}

// ============================================================================
// Default Configuration
// ============================================================================

const DEFAULT_CONFIG: VerificationAgentConfig = {
  maxClaims: 10,
  evidenceTopK: 5,
  minEvidenceSimilarity: 0.6,
  temperature: 0.1,
  extractClaims: true,
  rerankEvidence: true,
};

// ============================================================================
// Verification Agent Implementation
// ============================================================================

/**
 * Verification Agent
 *
 * Verifies content claims against an indexed knowledge base using RAG.
 */
export class VerificationAgent {
  private readonly gateway: AIGateway;
  private readonly ragPipeline: RAGPipeline;
  private readonly config: VerificationAgentConfig;

  constructor(
    gateway: AIGateway,
    ragPipeline: RAGPipeline,
    config: Partial<VerificationAgentConfig> = {}
  ) {
    this.gateway = gateway;
    this.ragPipeline = ragPipeline;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Verify content against the knowledge base.
   */
  async verify(request: VerificationRequest, userId: string): Promise<VerificationResponse> {
    const startTime = performance.now();
    let tokensUsed = 0;

    // Step 1: Extract claims if not provided
    let claims: Claim[];
    if (request.claims && request.claims.length > 0) {
      claims = request.claims.slice(0, this.config.maxClaims);
    } else if (this.config.extractClaims) {
      const extracted = await this.extractClaims(request.content, userId);
      claims = extracted.claims.slice(0, this.config.maxClaims);
      tokensUsed += extracted.tokensUsed;
    } else {
      // Create a single claim from the entire content
      claims = [
        {
          id: `claim-${Date.now()}`,
          text: request.content,
          position: { start: 0, end: request.content.length },
          type: "factual",
          entities: [],
        },
      ];
    }

    // Step 2: Verify each claim
    const verifications: ClaimVerification[] = [];
    const depth = request.depth ?? "thorough";
    const topK = this.getTopKForDepth(depth);

    for (const claim of claims) {
      const verification = await this.verifyClaim(claim, userId, topK, request.docIds);
      verifications.push(verification.result);
      tokensUsed += verification.tokensUsed;
    }

    // Step 3: Generate summary
    const summary = this.generateSummary(verifications);

    return {
      claims,
      verifications,
      summary,
      processingTimeMs: performance.now() - startTime,
      tokensUsed,
    };
  }

  /**
   * Extract claims from content using LLM.
   */
  private async extractClaims(
    content: string,
    userId: string
  ): Promise<{ claims: Claim[]; tokensUsed: number }> {
    const systemPrompt = `You are an expert claim extractor. Identify verifiable claims from the given content.

For each claim, provide:
1. The exact claim text
2. Position (start/end character indices)
3. Type: factual, statistical, quote, definition, or opinion
4. Key entities mentioned

Output format (JSON array):
[
  {
    "text": "The claim text...",
    "start": 0,
    "end": 50,
    "type": "factual",
    "entities": ["Entity1", "Entity2"]
  }
]

Focus on:
- Objective, verifiable facts
- Statistics and numbers
- Quoted statements
- Definitions and explanations

Skip:
- Opinions without factual basis
- Rhetorical questions
- Vague statements`;

    const messages: Message[] = [
      { role: "system", content: systemPrompt },
      { role: "user", content: `Extract verifiable claims from:\n\n${content}` },
    ];

    const response = await this.gateway.complete(messages, {
      userId,
      temperature: 0,
      maxTokens: 2000,
    });

    const claims = this.parseClaimsResponse(response.content);

    return {
      claims,
      tokensUsed: response.usage?.totalTokens ?? 0,
    };
  }

  /**
   * Parse claims extraction response.
   */
  private parseClaimsResponse(content: string): Claim[] {
    try {
      const jsonMatch = content.match(/\[[\s\S]*\]/);
      if (!jsonMatch) {
        return [];
      }

      const parsed = JSON.parse(jsonMatch[0]) as Array<{
        text?: string;
        start?: number;
        end?: number;
        type?: string;
        entities?: string[];
      }>;

      return parsed
        .filter((item) => item.text && typeof item.start === "number")
        .map((item, index) => ({
          id: `claim-${index}-${Date.now()}`,
          text: item.text ?? "",
          position: {
            start: item.start ?? 0,
            end: item.end ?? (item.start ?? 0) + (item.text?.length ?? 0),
          },
          type: (item.type as Claim["type"]) ?? "factual",
          entities: item.entities ?? [],
        }));
    } catch {
      return [];
    }
  }

  /**
   * Verify a single claim.
   */
  private async verifyClaim(
    claim: Claim,
    userId: string,
    topK: number,
    docIds?: string[]
  ): Promise<{ result: ClaimVerification; tokensUsed: number }> {
    // Retrieve evidence using RAG
    const searchResults = await this.ragPipeline.search(claim.text, userId, {
      topK,
      minSimilarity: this.config.minEvidenceSimilarity,
      docIds,
    });

    // If no evidence found
    if (searchResults.length === 0) {
      return {
        result: {
          claim,
          status: "insufficient_evidence",
          confidence: "low",
          confidenceScore: 0.2,
          evidence: [],
          citations: [],
          explanation: "No relevant evidence found in the knowledge base.",
        },
        tokensUsed: 0,
      };
    }

    // Use LLM to verify claim against evidence
    const verification = await this.verifyWithLLM(claim, searchResults, userId);

    return verification;
  }

  /**
   * Verify claim against evidence using LLM.
   */
  private async verifyWithLLM(
    claim: Claim,
    evidence: SearchResult[],
    userId: string
  ): Promise<{ result: ClaimVerification; tokensUsed: number }> {
    const systemPrompt = `You are a fact-checking expert. Verify the given claim against the provided evidence.

Analyze the evidence and determine:
1. Status: verified, partially_verified, unverified, contradicted, or insufficient_evidence
2. Confidence: high (0.8-1.0), medium (0.5-0.8), or low (0.0-0.5)
3. Relationship of each evidence piece: supports, contradicts, or neutral
4. Explanation of your reasoning
5. If contradicted, provide the correct information

Output format (JSON):
{
  "status": "verified",
  "confidenceScore": 0.85,
  "evidenceAnalysis": [
    {"sourceId": "chunk_id", "relationship": "supports", "relevance": 0.9}
  ],
  "explanation": "The claim is verified because...",
  "correction": null
}`;

    const evidenceText = evidence
      .map((e, i) => `[${i + 1}] (Source: ${e.chunk.id})\n${e.chunk.content.slice(0, 500)}`)
      .join("\n\n---\n\n");

    const messages: Message[] = [
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content: `Claim to verify: "${claim.text}"\n\nEvidence:\n${evidenceText}`,
      },
    ];

    const response = await this.gateway.complete(messages, {
      userId,
      temperature: this.config.temperature,
      maxTokens: 1000,
    });

    const parsed = this.parseVerificationResponse(response.content, evidence);

    // Build evidence items
    const evidenceItems: Evidence[] = evidence.map((e, i) => ({
      text: e.chunk.content.slice(0, 300),
      sourceChunkId: e.chunk.id,
      sourceDocId: e.chunk.docId,
      relevance: e.similarity,
      relationship: parsed.evidenceAnalysis[i]?.relationship ?? "neutral",
    }));

    // Build citations
    const citations: Citation[] = evidence
      .filter((_, i) => parsed.evidenceAnalysis[i]?.relationship === "supports")
      .map((e, i) => ({
        index: i + 1,
        docId: e.chunk.docId,
        excerpt: e.chunk.content.slice(0, 200),
        confidence: e.similarity,
      }));

    return {
      result: {
        claim,
        status: parsed.status,
        confidence: this.scoreToConfidence(parsed.confidenceScore),
        confidenceScore: parsed.confidenceScore,
        evidence: evidenceItems,
        citations,
        explanation: parsed.explanation,
        correction: parsed.correction,
      },
      tokensUsed: response.usage?.totalTokens ?? 0,
    };
  }

  /**
   * Parse verification LLM response.
   */
  private parseVerificationResponse(
    content: string,
    evidence: SearchResult[]
  ): {
    status: VerificationStatus;
    confidenceScore: number;
    evidenceAnalysis: Array<{ relationship: Evidence["relationship"] }>;
    explanation: string;
    correction?: string;
  } {
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error("No JSON found");
      }

      const parsed = JSON.parse(jsonMatch[0]);

      return {
        status: parsed.status ?? "insufficient_evidence",
        confidenceScore: Math.max(0, Math.min(1, parsed.confidenceScore ?? 0.5)),
        evidenceAnalysis:
          parsed.evidenceAnalysis ?? evidence.map(() => ({ relationship: "neutral" as const })),
        explanation: parsed.explanation ?? "Unable to verify claim.",
        correction: parsed.correction,
      };
    } catch {
      return {
        status: "insufficient_evidence",
        confidenceScore: 0.3,
        evidenceAnalysis: evidence.map(() => ({ relationship: "neutral" as const })),
        explanation: "Failed to parse verification response.",
      };
    }
  }

  /**
   * Convert score to confidence level.
   */
  private scoreToConfidence(score: number): ConfidenceLevel {
    if (score >= 0.8) {
      return "high";
    }
    if (score >= 0.5) {
      return "medium";
    }
    return "low";
  }

  /**
   * Get top-k for verification depth.
   */
  private getTopKForDepth(depth: VerificationRequest["depth"]): number {
    switch (depth) {
      case "quick":
        return 3;
      case "thorough":
        return this.config.evidenceTopK;
      case "exhaustive":
        return this.config.evidenceTopK * 2;
      default:
        return this.config.evidenceTopK;
    }
  }

  /**
   * Generate verification summary.
   */
  private generateSummary(verifications: ClaimVerification[]): VerificationResponse["summary"] {
    const counts = {
      verified: 0,
      partiallyVerified: 0,
      unverified: 0,
      contradicted: 0,
      insufficientEvidence: 0,
    };

    let totalConfidence = 0;

    for (const v of verifications) {
      switch (v.status) {
        case "verified":
          counts.verified++;
          break;
        case "partially_verified":
          counts.partiallyVerified++;
          break;
        case "unverified":
          counts.unverified++;
          break;
        case "contradicted":
          counts.contradicted++;
          break;
        case "insufficient_evidence":
          counts.insufficientEvidence++;
          break;
      }
      totalConfidence += v.confidenceScore;
    }

    const avgConfidence = verifications.length > 0 ? totalConfidence / verifications.length : 0;

    return {
      totalClaims: verifications.length,
      ...counts,
      overallConfidence: this.scoreToConfidence(avgConfidence),
    };
  }
}

/**
 * Create a verification agent.
 */
export function createVerificationAgent(
  gateway: AIGateway,
  ragPipeline: RAGPipeline,
  config: Partial<VerificationAgentConfig> = {}
): VerificationAgent {
  return new VerificationAgent(gateway, ragPipeline, config);
}
