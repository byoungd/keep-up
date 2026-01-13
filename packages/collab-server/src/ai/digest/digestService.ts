/**
 * Digest Service
 *
 * Orchestrates the Daily Digest generation pipeline:
 * scout → rank → synthesize → verify
 *
 * Track 2: Intelligence & Logic (AI)
 */

import type { EmbeddingService } from "../extraction/embeddingService";
import type { AIGateway } from "../gateway";
import type { RAGPipeline } from "../rag/ragPipeline";
import { type ClusteringConfig, ClusteringService, type ContentCluster } from "./clusteringService";
import {
  type LLMSynthesizer,
  type LLMSynthesizerConfig,
  createLLMSynthesizer,
} from "./llmSynthesizer";
import type {
  ContentItem,
  Digest,
  DigestCard,
  DigestGenerationOptions,
  DigestStatus,
  RankResult,
  ScoutResult,
  SynthesizeResult,
  VerificationResult,
} from "./types";

// ─────────────────────────────────────────────────────────────────────────────
// Configuration
// ─────────────────────────────────────────────────────────────────────────────

export interface DigestServiceConfig {
  /** Maximum cards per digest */
  maxCardsPerDigest: number;
  /** Default time window in hours */
  defaultTimeWindowHours: number;
  /** Minimum citation count per card */
  minCitationsPerCard: number;
  /** Minimum confidence for inclusion */
  minConfidenceThreshold: number;
  /** Whether to enable verification */
  enableVerification: boolean;
  /** Whether to use LLM for synthesis (default: true) */
  useLLMSynthesis: boolean;
  /** LLM Synthesizer configuration overrides */
  llmSynthesizer?: Partial<LLMSynthesizerConfig>;
  /** Whether to use semantic clustering (default: true) */
  useClustering: boolean;
  /** Clustering configuration overrides */
  clustering?: Partial<ClusteringConfig>;
}

const DEFAULT_CONFIG: DigestServiceConfig = {
  maxCardsPerDigest: 10,
  defaultTimeWindowHours: 24,
  minCitationsPerCard: 1,
  minConfidenceThreshold: 0.7,
  enableVerification: true,
  useLLMSynthesis: true,
  useClustering: true,
};

// ─────────────────────────────────────────────────────────────────────────────
// Content Store Interface
// ─────────────────────────────────────────────────────────────────────────────

/** Interface for content storage */
export interface ContentStore {
  /** Get content items within a time range */
  getItemsInRange(start: number, end: number): Promise<ContentItem[]>;
  /** Get content items by IDs */
  getItemsByIds(ids: string[]): Promise<ContentItem[]>;
  /** Get items by topic */
  getItemsByTopic(topic: string): Promise<ContentItem[]>;
}

/** Interface for digest storage */
export interface DigestStore {
  /** Save a digest */
  save(digest: Digest): Promise<void>;
  /** Get digest by ID */
  getById(id: string): Promise<Digest | null>;
  /** Get digest by date and user */
  getByDate(userId: string, date: string): Promise<Digest | null>;
  /** List recent digests */
  listRecent(userId: string, limit: number): Promise<Digest[]>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Digest Service
// ─────────────────────────────────────────────────────────────────────────────

export class DigestService {
  private readonly config: DigestServiceConfig;
  private readonly gateway: AIGateway;
  private readonly rag: RAGPipeline;
  private readonly contentStore: ContentStore;
  private readonly digestStore: DigestStore;
  private readonly llmSynthesizer: LLMSynthesizer | null;
  private readonly clusteringService: ClusteringService | null;

  constructor(
    gateway: AIGateway,
    rag: RAGPipeline,
    contentStore: ContentStore,
    digestStore: DigestStore,
    config: Partial<DigestServiceConfig> = {},
    embeddingService?: EmbeddingService
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.gateway = gateway;
    this.rag = rag;
    this.contentStore = contentStore;
    this.digestStore = digestStore;

    // Initialize LLM synthesizer if enabled
    this.llmSynthesizer = this.config.useLLMSynthesis
      ? createLLMSynthesizer(gateway, rag, config.llmSynthesizer)
      : null;

    // Initialize clustering service if enabled and embedding service provided
    this.clusteringService =
      this.config.useClustering && embeddingService
        ? new ClusteringService(embeddingService, gateway, config.clustering)
        : null;
  }

  /**
   * Generate a daily digest for a user
   */
  async generateDigest(userId: string, options: DigestGenerationOptions = {}): Promise<Digest> {
    const digestId = this.generateId();
    const date = this.formatDate(new Date());

    // Initialize digest in pending state
    const digest: Digest = {
      id: digestId,
      userId,
      date,
      title: `Daily Digest - ${date}`,
      cards: [],
      sourceItemCount: 0,
      status: "generating",
      startedAt: Date.now(),
    };

    await this.digestStore.save(digest);

    try {
      // Phase 1: Scout - Gather content items
      const scoutResult = await this.scout(options);
      digest.sourceItemCount = scoutResult.items.length;

      if (scoutResult.items.length === 0) {
        return this.completeDigest(digest, "ready", []);
      }

      // Phase 2: Rank - Score and cluster items
      const rankResult = await this.rank(scoutResult.items, options);

      // Phase 3: Synthesize - Generate cards
      const synthesizeResult = await this.synthesize(rankResult, options);

      // Phase 4: Verify - Validate citations
      let cards = synthesizeResult.cards;
      if (this.config.enableVerification) {
        cards = await this.verifyAndFilter(cards);
      }

      // Update token usage
      digest.tokenUsage = synthesizeResult.tokenUsage;

      return this.completeDigest(digest, "ready", cards);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      return this.completeDigest(digest, "failed", [], message);
    }
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Pipeline Phases
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Phase 1: Scout
   * Gather content items from the specified time window
   */
  private async scout(options: DigestGenerationOptions): Promise<ScoutResult> {
    const timeWindowHours = options.timeWindowHours ?? this.config.defaultTimeWindowHours;
    const end = Date.now();
    const start = end - timeWindowHours * 60 * 60 * 1000;

    let items = await this.contentStore.getItemsInRange(start, end);

    // Filter by topics if specified
    if (options.focusTopics && options.focusTopics.length > 0) {
      items = items.filter((item) =>
        item.topics.some((topic) => options.focusTopics?.includes(topic))
      );
    }

    return {
      items,
      totalAvailable: items.length,
      filters: {
        timeWindow: { start, end },
        topics: options.focusTopics,
      },
    };
  }

  /**
   * Phase 2: Rank
   * Score items by importance and cluster related items
   */
  private async rank(items: ContentItem[], options: DigestGenerationOptions): Promise<RankResult> {
    // Use clustering service if available
    if (this.clusteringService) {
      return this.rankWithClustering(items, options);
    }

    // Fallback: use recency as the primary signal (no clustering)
    const rankedItems = items
      .map((item) => ({
        item,
        score: this.calculateRecencyScore(item.ingestedAt),
        cluster: undefined,
      }))
      .sort((a, b) => b.score - a.score);

    return { rankedItems, clusters: [] };
  }

  /**
   * Rank items using semantic clustering
   */
  private async rankWithClustering(
    items: ContentItem[],
    options: DigestGenerationOptions
  ): Promise<RankResult> {
    // This should only be called when clusteringService is available
    if (!this.clusteringService) {
      throw new Error("Clustering service not initialized");
    }

    const maxClusters = options.maxCards ?? this.config.maxCardsPerDigest;

    const clusteringResult = await this.clusteringService.clusterItems(items, {
      maxClusters,
      minClusterSize: 1,
      similarityThreshold: 0.6,
      useLLMLabeling: true,
      userId: "system",
    });

    // Convert clusters to RankResult format
    const clusters: RankResult["clusters"] = clusteringResult.clusters.map(
      (cluster: ContentCluster) => ({
        id: cluster.id,
        topic: cluster.title,
        itemIds: cluster.items.map((i) => i.item.id),
        relevanceScore: cluster.relevanceScore,
      })
    );

    // Build ranked items with cluster assignments
    const rankedItems: RankResult["rankedItems"] = [];
    const processedIds = new Set<string>();

    // First, add items from clusters (in cluster order)
    for (const cluster of clusteringResult.clusters) {
      for (const clusteredItem of cluster.items) {
        if (!processedIds.has(clusteredItem.item.id)) {
          rankedItems.push({
            item: clusteredItem.item,
            score: cluster.relevanceScore * clusteredItem.similarityToCentroid,
            cluster: cluster.id,
          });
          processedIds.add(clusteredItem.item.id);
        }
      }
    }

    // Then, add unclustered items sorted by recency
    for (const item of clusteringResult.unclustered) {
      if (!processedIds.has(item.id)) {
        rankedItems.push({
          item,
          score: this.calculateRecencyScore(item.ingestedAt),
          cluster: undefined,
        });
        processedIds.add(item.id);
      }
    }

    return { rankedItems, clusters };
  }

  /**
   * Phase 3: Synthesize
   * Generate digest cards from ranked items using LLM or fallback
   */
  private async synthesize(
    rankResult: RankResult,
    options: DigestGenerationOptions
  ): Promise<SynthesizeResult> {
    const maxCards = options.maxCards ?? this.config.maxCardsPerDigest;

    // Use LLM synthesizer if available
    if (this.llmSynthesizer) {
      return this.llmSynthesizer.synthesize(rankResult, {
        maxCards,
        includeWhyItMatters: options.includeWhyItMatters ?? true,
        focusTopics: options.focusTopics,
      });
    }

    // Fallback: create basic cards without LLM
    const topItems = rankResult.rankedItems.slice(0, maxCards);
    const cards: DigestCard[] = topItems.map((ranked) => ({
      id: this.generateId(),
      type: "summary" as const,
      headline: ranked.item.title,
      summary: ranked.item.snippet ?? ranked.item.content.slice(0, 200),
      whyItMatters: options.includeWhyItMatters
        ? `This content is relevant to your interests in ${ranked.item.topics.slice(0, 2).join(" and ")}.`
        : undefined,
      sourceItemIds: [ranked.item.id],
      citations: [],
      confidence: "low" as const,
      topics: ranked.item.topics,
      priorityScore: Math.round(ranked.score * 100),
      generatedAt: Date.now(),
    }));

    return {
      cards,
      skippedItems: [],
      tokenUsage: { input: 0, output: 0 },
    };
  }

  /**
   * Phase 4: Verify
   * Validate citations and filter low-confidence cards
   */
  private async verifyAndFilter(cards: DigestCard[]): Promise<DigestCard[]> {
    const verifiedCards: DigestCard[] = [];

    for (const card of cards) {
      const result = await this.verifyCard(card);

      if (result.passed) {
        verifiedCards.push({
          ...card,
          confidence: result.confidence,
          citations: result.verifiedCitations,
        });
      }
      // Cards that fail verification are discarded (fail-safe)
    }

    return verifiedCards;
  }

  /**
   * Verify a single card's citations
   */
  private async verifyCard(card: DigestCard): Promise<VerificationResult> {
    // TODO: Implement actual verification logic
    // For now, pass cards with at least one source
    const passed = card.sourceItemIds.length >= this.config.minCitationsPerCard;

    return {
      cardId: card.id,
      passed,
      confidence: passed ? "medium" : "low",
      issues: passed
        ? []
        : [
            {
              type: "missing_source",
              description: "Card has insufficient source citations",
              severity: "error",
            },
          ],
      verifiedCitations: card.citations,
    };
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Helpers
  // ───────────────────────────────────────────────────────────────────────────

  private async completeDigest(
    digest: Digest,
    status: DigestStatus,
    cards: DigestCard[],
    error?: string
  ): Promise<Digest> {
    const completed: Digest = {
      ...digest,
      status,
      cards,
      completedAt: Date.now(),
      error,
    };

    await this.digestStore.save(completed);
    return completed;
  }

  private calculateRecencyScore(timestamp: number): number {
    const ageHours = (Date.now() - timestamp) / (60 * 60 * 1000);
    // Exponential decay: score drops to 0.5 after 12 hours
    return Math.exp(-0.0578 * ageHours);
  }

  private generateId(): string {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  }

  private formatDate(date: Date): string {
    return date.toISOString().split("T")[0];
  }
}
