/**
 * Citation Middleware
 *
 * Extracts inline citations from LLM responses, validates them against
 * source documents, and flags sentences that make factual claims without
 * proper citations.
 *
 * Track B: Intelligence & Grounding
 */

import type {
  CitationMiddlewareConfig,
  CitationRef,
  MiddlewareContext,
  MiddlewareResponse,
  ResponseFlag,
  ResponseMiddleware,
  SourceContext,
} from "./types";

// ============================================================================
// Citation Middleware Implementation
// ============================================================================

/**
 * Citation Middleware - Enforces citation requirements in LLM responses.
 *
 * Features:
 * - Extracts inline citations (e.g., [sourceId], [1], [doc:abc])
 * - Validates citations against provided source documents
 * - Flags factual sentences without citations
 * - Calculates confidence based on grounding
 */
export class CitationMiddleware implements ResponseMiddleware {
  readonly name = "citation-grounding";
  readonly priority = 100; // Run early in the chain

  private readonly config: Required<CitationMiddlewareConfig>;

  constructor(config: CitationMiddlewareConfig = {}) {
    this.config = {
      citationPattern: config.citationPattern ?? /\[([^\]]+)\]/g,
      uncitedConfidence: config.uncitedConfidence ?? 0.3,
      factualKeywords: config.factualKeywords ?? DEFAULT_FACTUAL_KEYWORDS,
      validateCitations: config.validateCitations ?? true,
      flagUncited: config.flagUncited ?? true,
      minSentenceWords: config.minSentenceWords ?? 5,
    };
  }

  /**
   * Process the response to extract and validate citations.
   */
  async process(
    response: MiddlewareResponse,
    context: MiddlewareContext
  ): Promise<MiddlewareResponse> {
    // 1. Extract inline citations
    const citations = this.extractCitations(response.content);

    // 2. Validate citations against sources
    if (this.config.validateCitations && context.sources) {
      this.validateCitations(citations, context.sources);
    }

    // 3. Flag uncited factual sentences
    const flags: ResponseFlag[] = [...response.flags];
    if (this.config.flagUncited) {
      const uncitedFlags = this.flagUncitedSentences(response.content, citations);
      flags.push(...uncitedFlags);
    }

    // 4. Calculate confidence based on grounding
    const confidence = this.calculateConfidence(response.content, citations, flags);

    return {
      ...response,
      citations: [...response.citations, ...citations],
      flags,
      confidence: Math.min(response.confidence, confidence),
    };
  }

  /**
   * Extract inline citations from content.
   */
  private extractCitations(content: string): CitationRef[] {
    const citations: CitationRef[] = [];
    const pattern = new RegExp(this.config.citationPattern.source, "g");

    for (const match of content.matchAll(pattern)) {
      const sourceId = match[1].trim();

      // Skip numeric-only citations that might be list items
      if (/^\d+$/.test(sourceId) && this.looksLikeListItem(content, match.index ?? 0)) {
        continue;
      }

      citations.push({
        sourceId,
        confidence: 0.5, // Default confidence until validated
        position: {
          startOffset: match.index ?? 0,
          endOffset: (match.index ?? 0) + match[0].length,
        },
        validated: false,
      });
    }

    // Deduplicate by sourceId
    const seen = new Set<string>();
    return citations.filter((c) => {
      if (seen.has(c.sourceId)) {
        return false;
      }
      seen.add(c.sourceId);
      return true;
    });
  }

  /**
   * Check if a bracket might be a list item rather than a citation.
   */
  private looksLikeListItem(content: string, position: number): boolean {
    // Check if preceded by newline or start of content
    const before = content.slice(Math.max(0, position - 5), position);
    return /^\s*$/.test(before) || /\n\s*$/.test(before);
  }

  /**
   * Validate citations against source documents.
   */
  private validateCitations(citations: CitationRef[], sources: SourceContext[]): void {
    const sourceMap = new Map(sources.map((s) => [s.id, s]));

    for (const citation of citations) {
      const source = sourceMap.get(citation.sourceId);

      if (source) {
        citation.validated = true;
        citation.url = source.url;
        citation.confidence = 0.9; // High confidence when source exists

        // Try to find a matching excerpt
        if (source.excerpts && source.excerpts.length > 0) {
          citation.excerpt = source.excerpts[0];
        }
      } else {
        // Citation references unknown source
        citation.validated = false;
        citation.confidence = 0.2;
      }
    }
  }

  /**
   * Flag sentences that make factual claims without citations.
   */
  private flagUncitedSentences(content: string, citations: CitationRef[]): ResponseFlag[] {
    const flags: ResponseFlag[] = [];
    const sentences = this.splitIntoSentences(content);

    // Build set of citation positions for quick lookup
    const citationPositions = new Set<number>();
    for (const citation of citations) {
      if (citation.position) {
        citationPositions.add(citation.position.startOffset);
      }
    }

    let currentOffset = 0;
    for (const sentence of sentences) {
      const sentenceStart = content.indexOf(sentence, currentOffset);
      const sentenceEnd = sentenceStart + sentence.length;
      currentOffset = sentenceEnd;

      // Skip short sentences
      const wordCount = sentence.split(/\s+/).filter((w) => w.length > 0).length;
      if (wordCount < this.config.minSentenceWords) {
        continue;
      }

      // Check if sentence contains a citation
      const hasCitation = this.sentenceHasCitation(sentence, sentenceStart, sentenceEnd, citations);

      if (!hasCitation && this.isFactualSentence(sentence)) {
        flags.push({
          type: "missing_citation",
          description: "Factual claim without citation",
          severity: "warning",
          text: sentence.slice(0, 100) + (sentence.length > 100 ? "..." : ""),
          startOffset: sentenceStart,
          endOffset: sentenceEnd,
          suggestion: "Add a citation to support this claim",
        });
      }
    }

    return flags;
  }

  /**
   * Check if a sentence contains a citation.
   */
  private sentenceHasCitation(
    sentence: string,
    sentenceStart: number,
    sentenceEnd: number,
    citations: CitationRef[]
  ): boolean {
    // Check if any citation falls within this sentence
    for (const citation of citations) {
      if (citation.position) {
        const citationStart = citation.position.startOffset;
        if (citationStart >= sentenceStart && citationStart < sentenceEnd) {
          return true;
        }
      }
    }

    // Also check if the sentence text contains citation pattern
    const pattern = new RegExp(this.config.citationPattern.source);
    return pattern.test(sentence);
  }

  /**
   * Determine if a sentence makes a factual claim.
   */
  private isFactualSentence(sentence: string): boolean {
    const lowerSentence = sentence.toLowerCase();

    // Skip questions
    if (sentence.trim().endsWith("?")) {
      return false;
    }

    // Skip sentences that are clearly opinions or suggestions
    const opinionPhrases = [
      "i think",
      "in my opinion",
      "you might",
      "you could",
      "consider",
      "perhaps",
      "maybe",
      "it seems",
      "appears to",
    ];
    if (opinionPhrases.some((phrase) => lowerSentence.includes(phrase))) {
      return false;
    }

    // Check for factual keywords
    return this.config.factualKeywords.some((keyword) => lowerSentence.includes(keyword));
  }

  /**
   * Calculate confidence based on citation coverage.
   */
  private calculateConfidence(
    _content: string,
    citations: CitationRef[],
    flags: ResponseFlag[]
  ): number {
    // Base confidence
    let confidence = 0.5;

    // Increase confidence for validated citations
    const validatedCount = citations.filter((c) => c.validated).length;
    if (citations.length > 0) {
      const validationRatio = validatedCount / citations.length;
      confidence += validationRatio * 0.3; // Up to +0.3 for all validated
    }

    // Decrease confidence for flags
    const errorCount = flags.filter((f) => f.severity === "error").length;
    const warningCount = flags.filter((f) => f.severity === "warning").length;
    confidence -= errorCount * 0.15;
    confidence -= warningCount * 0.05;

    // Clamp to valid range
    return Math.max(0, Math.min(1, confidence));
  }

  /**
   * Split content into sentences.
   */
  private splitIntoSentences(content: string): string[] {
    // Handle common abbreviations that shouldn't split sentences
    const preprocessed = content
      .replace(/\b(Mr|Mrs|Ms|Dr|Prof|Jr|Sr|Inc|Ltd|Corp|vs|etc|e\.g|i\.e)\./gi, "$1<PERIOD>")
      .replace(/(\d)\./g, "$1<PERIOD>");

    const sentences = preprocessed
      .split(/(?<=[.!?])\s+/)
      .map((s) => s.replace(/<PERIOD>/g, ".").trim())
      .filter((s) => s.length > 0);

    return sentences;
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a citation middleware with optional configuration.
 */
export function createCitationMiddleware(config?: CitationMiddlewareConfig): CitationMiddleware {
  return new CitationMiddleware(config);
}

// ============================================================================
// Constants
// ============================================================================

/**
 * Default keywords/phrases that indicate factual claims requiring citation.
 *
 * Design principle: Use compound phrases rather than single common words
 * to minimize false positives while catching genuine factual statements.
 */
const DEFAULT_FACTUAL_KEYWORDS = [
  // Statistics and quantitative claims
  "percent",
  "%",
  "million",
  "billion",
  "thousand",
  "number of",
  "rate of",
  "majority of",

  // Temporal claims with specificity
  "in 2", // Catches years like "in 2023"
  "since 2",
  "as of 2",
  "by 2",

  // Research and evidence markers
  "study shows",
  "studies show",
  "research shows",
  "research indicates",
  "found that",
  "shows that",
  "according to",
  "reported that",
  "discovered that",
  "data shows",
  "evidence suggests",

  // Causation with specificity
  "causes",
  "results in",
  "leads to",
  "linked to",
  "associated with",

  // Quantified comparisons
  "more than",
  "less than",
  "higher than",
  "lower than",
  "increased by",
  "decreased by",
  "doubled",
  "tripled",

  // Absolute claims (strong indicators)
  "always",
  "never",
  "every",
  "all",
  "none",
  "proven",
  "confirmed",
  "established",

  // Expert/authority claims
  "experts say",
  "scientists",
  "researchers",
  "official",
];
