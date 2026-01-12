/**
 * Suggestion Generator
 *
 * Generates grounded AI suggestions with citations.
 * Stub implementation for MVP - actual AI integration to be added later.
 */

/** Citation source */
export interface Citation {
  /** Source ID */
  id: string;
  /** Source type (document, web, etc.) */
  type: "document" | "web" | "knowledge_base";
  /** Source title */
  title: string;
  /** Source URL or reference */
  url?: string;
  /** Relevant excerpt */
  excerpt?: string;
  /** Confidence score (0-1) */
  confidence: number;
}

/** Suggestion type */
export type SuggestionType = "completion" | "rewrite" | "expansion" | "summary" | "correction";

/** Suggestion status */
export type SuggestionStatus = "pending" | "applied" | "rejected" | "expired";

/** AI suggestion */
export interface Suggestion {
  /** Unique suggestion ID */
  id: string;
  /** Document ID */
  docId: string;
  /** Suggestion type */
  type: SuggestionType;
  /** Suggested content */
  content: string;
  /** Citations supporting the suggestion */
  citations: Citation[];
  /** Target position in document (block ID or range) */
  targetPosition?: {
    blockId?: string;
    startOffset?: number;
    endOffset?: number;
  };
  /** Confidence score (0-1) */
  confidence: number;
  /** Status */
  status: SuggestionStatus;
  /** Created timestamp */
  createdAt: number;
  /** Expiry timestamp */
  expiresAt: number;
}

/** Suggestion request */
export interface SuggestionRequest {
  /** Document ID */
  docId: string;
  /** User ID */
  userId: string;
  /** Request type */
  type: SuggestionType;
  /** Context (surrounding text) */
  context?: string;
  /** Target position */
  targetPosition?: {
    blockId?: string;
    startOffset?: number;
    endOffset?: number;
  };
  /** Maximum suggestions to return */
  maxSuggestions?: number;
}

/** Suggestion response */
export interface SuggestionResponse {
  /** Generated suggestions */
  suggestions: Suggestion[];
  /** Whether there was insufficient evidence */
  insufficientEvidence: boolean;
  /** Reason for insufficient evidence */
  insufficientEvidenceReason?: string;
}

/** Suggestion generator configuration */
export interface SuggestionGeneratorConfig {
  /** Minimum confidence threshold (default: 0.7) */
  minConfidence: number;
  /** Minimum citations required (default: 1) */
  minCitations: number;
  /** Suggestion TTL in ms (default: 5 minutes) */
  suggestionTtlMs: number;
  /** Maximum suggestions per request (default: 3) */
  maxSuggestionsPerRequest: number;
}

const DEFAULT_CONFIG: SuggestionGeneratorConfig = {
  minConfidence: 0.7,
  minCitations: 1,
  suggestionTtlMs: 5 * 60 * 1000, // 5 minutes
  maxSuggestionsPerRequest: 3,
};

/**
 * Suggestion generator for AI-powered suggestions.
 * This is a stub implementation - actual AI integration to be added.
 */
export class SuggestionGenerator {
  private config: SuggestionGeneratorConfig;
  private suggestions = new Map<string, Suggestion>();

  constructor(config: Partial<SuggestionGeneratorConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Generate suggestions for a request.
   * Returns insufficient evidence if context is lacking.
   */
  async generate(request: SuggestionRequest): Promise<SuggestionResponse> {
    // Validate request
    if (!request.docId || !request.userId) {
      return {
        suggestions: [],
        insufficientEvidence: true,
        insufficientEvidenceReason: "Missing required fields",
      };
    }

    // Check for sufficient context
    if (!request.context || request.context.length < 10) {
      return {
        suggestions: [],
        insufficientEvidence: true,
        insufficientEvidenceReason: "Insufficient context provided",
      };
    }

    // Stub: Generate mock suggestions
    // In production, this would call an AI service
    const suggestions = this.generateMockSuggestions(request);

    // Filter by confidence
    const filteredSuggestions = suggestions.filter(
      (s) => s.confidence >= this.config.minConfidence
    );

    // Check citation requirements
    const validSuggestions = filteredSuggestions.filter(
      (s) => s.citations.length >= this.config.minCitations
    );

    if (validSuggestions.length === 0 && filteredSuggestions.length > 0) {
      return {
        suggestions: [],
        insufficientEvidence: true,
        insufficientEvidenceReason: "No suggestions with sufficient citations",
      };
    }

    // Store suggestions
    for (const suggestion of validSuggestions) {
      this.suggestions.set(suggestion.id, suggestion);
    }

    return {
      suggestions: validSuggestions.slice(
        0,
        request.maxSuggestions ?? this.config.maxSuggestionsPerRequest
      ),
      insufficientEvidence: validSuggestions.length === 0,
    };
  }

  /**
   * Get a suggestion by ID.
   */
  getSuggestion(id: string): Suggestion | undefined {
    const suggestion = this.suggestions.get(id);
    if (!suggestion) {
      return undefined;
    }

    // Check expiry
    if (Date.now() > suggestion.expiresAt) {
      this.suggestions.delete(id);
      return undefined;
    }

    return suggestion;
  }

  /**
   * Update suggestion status.
   */
  updateStatus(id: string, status: SuggestionStatus): boolean {
    const suggestion = this.suggestions.get(id);
    if (!suggestion) {
      return false;
    }

    suggestion.status = status;
    return true;
  }

  /**
   * Clean up expired suggestions.
   */
  cleanup(): number {
    const now = Date.now();
    let removed = 0;

    for (const [id, suggestion] of this.suggestions) {
      if (now > suggestion.expiresAt) {
        this.suggestions.delete(id);
        removed++;
      }
    }

    return removed;
  }

  /**
   * Get suggestion count.
   */
  getSuggestionCount(): number {
    return this.suggestions.size;
  }

  /**
   * Clear all suggestions.
   */
  clear(): void {
    this.suggestions.clear();
  }

  /**
   * Generate mock suggestions (stub implementation).
   */
  private generateMockSuggestions(request: SuggestionRequest): Suggestion[] {
    const now = Date.now();
    const baseId = `sug-${now}-${Math.random().toString(36).slice(2, 8)}`;

    // Stub: Return a single mock suggestion
    return [
      {
        id: baseId,
        docId: request.docId,
        type: request.type,
        content: `[AI Suggestion for "${request.context?.slice(0, 20)}..."]`,
        citations: [
          {
            id: `cite-${now}`,
            type: "document",
            title: "Source Document",
            excerpt: "Relevant excerpt from source",
            confidence: 0.85,
          },
        ],
        targetPosition: request.targetPosition,
        confidence: 0.8,
        status: "pending",
        createdAt: now,
        expiresAt: now + this.config.suggestionTtlMs,
      },
    ];
  }
}
