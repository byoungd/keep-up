/**
 * LLM Synthesizer
 *
 * Handles AI-powered synthesis of content items into digest cards.
 * Uses structured prompts and JSON schema for reliable output.
 *
 * Track 2: Intelligence & Logic (AI)
 */

import type { Message } from "@keepup/ai-core";
import type { AIGateway, AIRequestOptions } from "../gateway";
import type { RAGPipeline } from "../rag/ragPipeline";
import type {
  ConfidenceLevel,
  ContentItem,
  DigestCard,
  DigestCardType,
  RankResult,
  SynthesizeResult,
} from "./types";

// ===========================================================================
// Configuration
// ===========================================================================

export interface LLMSynthesizerConfig {
  /** Maximum cards per batch synthesis */
  maxCardsPerBatch: number;
  /** Whether to generate "Why it matters" explanations */
  generateWhyItMatters: boolean;
  /** Maximum summary length in characters */
  maxSummaryLength: number;
  /** Maximum headline length in characters */
  maxHeadlineLength: number;
  /** Minimum content length for synthesis */
  minContentLength: number;
  /** Model to use for synthesis */
  model: string;
  /** Temperature for generation */
  temperature: number;
  /** System user ID for AI operations */
  systemUserId: string;
}

const DEFAULT_CONFIG: LLMSynthesizerConfig = {
  maxCardsPerBatch: 5,
  generateWhyItMatters: true,
  maxSummaryLength: 500,
  maxHeadlineLength: 100,
  minContentLength: 50,
  model: "gpt-4o-mini",
  temperature: 0.7,
  systemUserId: "system:digest-generator",
};

// ===========================================================================
// Prompts
// ===========================================================================

const SYNTHESIS_SYSTEM_PROMPT = `You are an expert content curator creating a daily digest. Your task is to synthesize multiple content items into concise, informative digest cards.

For each card, you must:
1. Create a compelling headline that captures the essence
2. Write a clear, accurate summary
3. Explain why this matters to the reader
4. Identify the main topics covered
5. Assess your confidence in the summary accuracy

Output format: JSON array of cards following the exact schema provided.

Guidelines:
- Be concise but informative
- Preserve key facts and figures
- Avoid speculation beyond what's in the source
- Use active voice
- Focus on actionable insights
- Never fabricate information`;

const CLUSTER_SYNTHESIS_PROMPT =
  "Synthesize these related content items into a single coherent summary that captures the common theme and key insights from all sources.";

const _TREND_SYNTHESIS_PROMPT =
  "Identify the emerging trend across these content items and explain its significance. Focus on patterns, implications, and what to watch for.";

// ===========================================================================
// Types
// ===========================================================================

interface SynthesisRequest {
  items: ContentItem[];
  cardType: DigestCardType;
  focusTopics?: string[];
  includeWhyItMatters: boolean;
}

interface CardSchema {
  headline: string;
  summary: string;
  whyItMatters?: string;
  topics: string[];
  confidence: ConfidenceLevel;
  priorityScore: number;
}

// ===========================================================================
// LLM Synthesizer Class
// ===========================================================================

export class LLMSynthesizer {
  private readonly config: LLMSynthesizerConfig;
  private readonly gateway: AIGateway;
  private readonly rag: RAGPipeline;
  private totalInputTokens = 0;
  private totalOutputTokens = 0;

  constructor(gateway: AIGateway, rag: RAGPipeline, config: Partial<LLMSynthesizerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.gateway = gateway;
    this.rag = rag;
  }

  /**
   * Synthesize ranked items into digest cards.
   */
  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: synthesis orchestrates batching, retries, and model selection
  async synthesize(
    rankResult: RankResult,
    options: {
      maxCards?: number;
      includeWhyItMatters?: boolean;
      focusTopics?: string[];
    } = {}
  ): Promise<SynthesizeResult> {
    const maxCards = options.maxCards ?? 10;
    const includeWhyItMatters = options.includeWhyItMatters ?? this.config.generateWhyItMatters;

    const cards: DigestCard[] = [];
    const skippedItems: Array<{ itemId: string; reason: string }> = [];

    this.totalInputTokens = 0;
    this.totalOutputTokens = 0;

    // Process clusters first (if any)
    for (const cluster of rankResult.clusters) {
      if (cards.length >= maxCards) {
        break;
      }

      const clusterItems = rankResult.rankedItems
        .filter((r) => r.cluster === cluster.id)
        .map((r) => r.item);

      if (clusterItems.length > 0) {
        try {
          const card = await this.synthesizeCluster(
            clusterItems,
            cluster.topic,
            includeWhyItMatters
          );
          if (card) {
            cards.push(card);
          }
        } catch (error) {
          console.error(`[LLMSynthesizer] Cluster synthesis failed: ${error}`);
          for (const item of clusterItems) {
            skippedItems.push({
              itemId: item.id,
              reason: "Cluster synthesis failed",
            });
          }
        }
      }
    }

    // Process remaining individual items
    const processedIds = new Set(cards.flatMap((c) => c.sourceItemIds));
    const remainingItems = rankResult.rankedItems
      .filter((r) => !processedIds.has(r.item.id))
      .slice(0, maxCards - cards.length);

    // Batch process remaining items
    const batches = this.batchItems(
      remainingItems.map((r) => r.item),
      this.config.maxCardsPerBatch
    );

    for (const batch of batches) {
      if (cards.length >= maxCards) {
        break;
      }

      try {
        const batchCards = await this.synthesizeBatch(batch, {
          items: batch,
          cardType: "summary",
          focusTopics: options.focusTopics,
          includeWhyItMatters,
        });

        for (const card of batchCards) {
          if (cards.length < maxCards) {
            cards.push(card);
          }
        }
      } catch (error) {
        console.error(`[LLMSynthesizer] Batch synthesis failed: ${error}`);
        for (const item of batch) {
          skippedItems.push({
            itemId: item.id,
            reason: "Batch synthesis failed",
          });
        }
      }
    }

    return {
      cards,
      skippedItems,
      tokenUsage: {
        input: this.totalInputTokens,
        output: this.totalOutputTokens,
      },
    };
  }

  /**
   * Synthesize a cluster of related items into a single card.
   */
  private async synthesizeCluster(
    items: ContentItem[],
    topic: string,
    includeWhyItMatters: boolean
  ): Promise<DigestCard | null> {
    if (items.length === 0) {
      return null;
    }

    const prompt = this.buildClusterPrompt(items, topic, includeWhyItMatters);
    const response = await this.callLLM(prompt);

    if (!response) {
      return null;
    }

    const parsed = this.parseCardResponse(response);
    if (!parsed) {
      return null;
    }

    return {
      id: this.generateId(),
      type: "cluster",
      headline: this.truncate(parsed.headline, this.config.maxHeadlineLength),
      summary: this.truncate(parsed.summary, this.config.maxSummaryLength),
      whyItMatters: parsed.whyItMatters,
      sourceItemIds: items.map((i) => i.id),
      citations: [], // Will be populated by verification
      confidence: parsed.confidence,
      topics: parsed.topics,
      priorityScore: parsed.priorityScore,
      generatedAt: Date.now(),
    };
  }

  /**
   * Synthesize a batch of individual items into cards.
   */
  private async synthesizeBatch(
    items: ContentItem[],
    request: SynthesisRequest
  ): Promise<DigestCard[]> {
    if (items.length === 0) {
      return [];
    }

    const prompt = this.buildBatchPrompt(items, request);
    const response = await this.callLLM(prompt);

    if (!response) {
      return [];
    }

    const cards: DigestCard[] = [];
    const parsedArray = this.parseBatchResponse(response);

    for (let i = 0; i < parsedArray.length && i < items.length; i++) {
      const parsed = parsedArray[i];
      const item = items[i];

      cards.push({
        id: this.generateId(),
        type: request.cardType,
        headline: this.truncate(parsed.headline, this.config.maxHeadlineLength),
        summary: this.truncate(parsed.summary, this.config.maxSummaryLength),
        whyItMatters: parsed.whyItMatters,
        sourceItemIds: [item.id],
        citations: [],
        confidence: parsed.confidence,
        topics: parsed.topics,
        priorityScore: parsed.priorityScore,
        generatedAt: Date.now(),
      });
    }

    return cards;
  }

  // ===========================================================================
  // Prompt Building
  // ===========================================================================

  private buildClusterPrompt(
    items: ContentItem[],
    topic: string,
    includeWhyItMatters: boolean
  ): Message[] {
    const contentList = items
      .map(
        (item, idx) =>
          `[Source ${idx + 1}] ${item.title}\n${item.snippet ?? item.content.slice(0, 500)}`
      )
      .join("\n\n");

    const userPrompt = `${CLUSTER_SYNTHESIS_PROMPT}

Topic: ${topic}

Content Items:
${contentList}

Generate a single digest card in JSON format:
{
  "headline": "Compelling headline (max 100 chars)",
  "summary": "Concise synthesis of all sources (max 500 chars)",
  ${includeWhyItMatters ? '"whyItMatters": "Why this matters to the reader (1-2 sentences)",' : ""}
  "topics": ["topic1", "topic2"],
  "confidence": "high" | "medium" | "low",
  "priorityScore": 0-100
}`;

    return [
      { role: "system", content: SYNTHESIS_SYSTEM_PROMPT },
      { role: "user", content: userPrompt },
    ];
  }

  private buildBatchPrompt(items: ContentItem[], request: SynthesisRequest): Message[] {
    const contentList = items
      .map(
        (item, idx) =>
          `[Item ${idx + 1}]
Title: ${item.title}
Content: ${item.snippet ?? item.content.slice(0, 500)}
Topics: ${item.topics.join(", ")}`
      )
      .join("\n\n---\n\n");

    const userPrompt = `Synthesize each of the following ${items.length} content items into individual digest cards.

${contentList}

Output a JSON array with one card per item:
[
  {
    "headline": "Compelling headline (max 100 chars)",
    "summary": "Clear summary (max 500 chars)",
    ${request.includeWhyItMatters ? '"whyItMatters": "Why this matters (1-2 sentences)",' : ""}
    "topics": ["topic1", "topic2"],
    "confidence": "high" | "medium" | "low",
    "priorityScore": 0-100
  }
]

Generate exactly ${items.length} cards in the same order as the items.`;

    return [
      { role: "system", content: SYNTHESIS_SYSTEM_PROMPT },
      { role: "user", content: userPrompt },
    ];
  }

  // ===========================================================================
  // LLM Interaction
  // ===========================================================================

  private async callLLM(messages: Message[]): Promise<string | null> {
    try {
      const options: AIRequestOptions = {
        userId: this.config.systemUserId,
        model: this.config.model,
        temperature: this.config.temperature,
        maxTokens: 2000,
      };

      const response = await this.gateway.complete(messages, options);

      this.totalInputTokens += response.usage.inputTokens;
      this.totalOutputTokens += response.usage.outputTokens;

      return response.content;
    } catch (error) {
      console.error("[LLMSynthesizer] LLM call failed:", error);
      return null;
    }
  }

  // ===========================================================================
  // Response Parsing
  // ===========================================================================

  private parseCardResponse(response: string): CardSchema | null {
    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        return null;
      }

      const parsed = JSON.parse(jsonMatch[0]);
      return this.validateCardSchema(parsed);
    } catch {
      console.error("[LLMSynthesizer] Failed to parse card response");
      return null;
    }
  }

  private parseBatchResponse(response: string): CardSchema[] {
    try {
      const jsonMatch = response.match(/\[[\s\S]*\]/);
      if (!jsonMatch) {
        return [];
      }

      const parsed = JSON.parse(jsonMatch[0]);
      if (!Array.isArray(parsed)) {
        return [];
      }

      return parsed
        .map((item) => this.validateCardSchema(item))
        .filter((item): item is CardSchema => item !== null);
    } catch {
      console.error("[LLMSynthesizer] Failed to parse batch response");
      return [];
    }
  }

  private validateCardSchema(data: unknown): CardSchema | null {
    if (!data || typeof data !== "object") {
      return null;
    }

    const obj = data as Record<string, unknown>;

    if (typeof obj.headline !== "string" || typeof obj.summary !== "string") {
      return null;
    }

    const confidence = this.normalizeConfidence(obj.confidence);
    const topics = Array.isArray(obj.topics)
      ? obj.topics.filter((t): t is string => typeof t === "string")
      : [];

    return {
      headline: obj.headline,
      summary: obj.summary,
      whyItMatters: typeof obj.whyItMatters === "string" ? obj.whyItMatters : undefined,
      topics,
      confidence,
      priorityScore:
        typeof obj.priorityScore === "number"
          ? Math.min(100, Math.max(0, Math.round(obj.priorityScore)))
          : 50,
    };
  }

  private normalizeConfidence(value: unknown): ConfidenceLevel {
    if (value === "high" || value === "medium" || value === "low") {
      return value;
    }
    return "medium";
  }

  // ===========================================================================
  // Utilities
  // ===========================================================================

  private batchItems<T>(items: T[], batchSize: number): T[][] {
    const batches: T[][] = [];
    for (let i = 0; i < items.length; i += batchSize) {
      batches.push(items.slice(i, i + batchSize));
    }
    return batches;
  }

  private truncate(text: string, maxLength: number): string {
    if (text.length <= maxLength) {
      return text;
    }
    return `${text.slice(0, maxLength - 3)}...`;
  }

  private generateId(): string {
    return `card-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  }
}

// ===========================================================================
// Factory
// ===========================================================================

/**
 * Create an LLM Synthesizer instance.
 */
export function createLLMSynthesizer(
  gateway: AIGateway,
  rag: RAGPipeline,
  config?: Partial<LLMSynthesizerConfig>
): LLMSynthesizer {
  return new LLMSynthesizer(gateway, rag, config);
}
