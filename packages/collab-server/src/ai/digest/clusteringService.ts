/**
 * Clustering Service
 *
 * Groups content items by semantic similarity using embeddings.
 * Integrates with EmbeddingService and VectorStore for efficient clustering.
 *
 * Track B: Intelligence & Grounding
 */

import type { EmbeddingService } from "../extraction/embeddingService";
import type { AIGateway } from "../gateway";
import type { ContentItem } from "./types";

// ============================================================================
// Types
// ============================================================================

/** Configuration for clustering */
export interface ClusteringConfig {
  /** Maximum number of clusters to create */
  maxClusters: number;
  /** Minimum items per cluster */
  minClusterSize: number;
  /** Similarity threshold for grouping (0-1) */
  similarityThreshold: number;
  /** Whether to use LLM for cluster labeling */
  useLLMLabeling: boolean;
  /** User ID for API calls */
  userId: string;
}

/** A cluster of related content items */
export interface ContentCluster {
  /** Cluster ID */
  id: string;
  /** Generated cluster title */
  title: string;
  /** Cluster summary */
  summary: string;
  /** Items in this cluster */
  items: ClusteredItem[];
  /** Average similarity score within cluster */
  cohesion: number;
  /** Topics represented in cluster */
  topics: string[];
  /** Relevance score for ranking */
  relevanceScore: number;
}

/** Item with clustering metadata */
export interface ClusteredItem {
  /** Original content item */
  item: ContentItem;
  /** Similarity to cluster centroid */
  similarityToCentroid: number;
  /** Whether this is the representative item */
  isRepresentative: boolean;
}

/** Clustering result */
export interface ClusteringResult {
  /** Generated clusters */
  clusters: ContentCluster[];
  /** Items that didn't fit any cluster */
  unclustered: ContentItem[];
  /** Statistics */
  stats: ClusteringStats;
}

/** Clustering statistics */
export interface ClusteringStats {
  /** Total items processed */
  totalItems: number;
  /** Items clustered */
  clusteredItems: number;
  /** Number of clusters created */
  clusterCount: number;
  /** Average cluster size */
  avgClusterSize: number;
  /** Average cluster cohesion */
  avgCohesion: number;
  /** Processing time (ms) */
  processingTimeMs: number;
}

// ============================================================================
// Clustering Service Implementation
// ============================================================================

const DEFAULT_CONFIG: ClusteringConfig = {
  maxClusters: 10,
  minClusterSize: 2,
  similarityThreshold: 0.6,
  useLLMLabeling: true,
  userId: "system",
};

/**
 * Clustering Service
 *
 * Groups content items by semantic similarity for digest generation.
 */
export class ClusteringService {
  private readonly config: ClusteringConfig;
  private readonly embeddingService: EmbeddingService;
  private readonly gateway: AIGateway;

  constructor(
    embeddingService: EmbeddingService,
    gateway: AIGateway,
    config: Partial<ClusteringConfig> = {}
  ) {
    this.embeddingService = embeddingService;
    this.gateway = gateway;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Cluster content items by semantic similarity.
   */
  async clusterItems(
    items: ContentItem[],
    options: Partial<ClusteringConfig> = {}
  ): Promise<ClusteringResult> {
    const startTime = Date.now();
    const config = { ...this.config, ...options };

    if (items.length === 0) {
      return this.emptyResult(startTime);
    }

    // 1. Generate embeddings for all items
    const embeddings = await this.generateEmbeddings(items, config.userId);

    // 2. Perform agglomerative clustering
    const rawClusters = this.agglomerativeClustering(
      items,
      embeddings,
      config.similarityThreshold,
      config.maxClusters
    );

    // 3. Filter by minimum size and sort by relevance
    const validClusters = rawClusters
      .filter((c) => c.items.length >= config.minClusterSize)
      .sort((a, b) => b.relevanceScore - a.relevanceScore)
      .slice(0, config.maxClusters);

    // 4. Collect unclustered items
    const clusteredIds = new Set(validClusters.flatMap((c) => c.items.map((i) => i.item.id)));
    const unclustered = items.filter((item) => !clusteredIds.has(item.id));

    // 5. Generate titles and summaries via LLM
    const labeledClusters = config.useLLMLabeling
      ? await this.labelClusters(validClusters, config.userId)
      : validClusters;

    return {
      clusters: labeledClusters,
      unclustered,
      stats: this.calculateStats(items, labeledClusters, startTime),
    };
  }

  /**
   * Generate embeddings for content items.
   */
  private async generateEmbeddings(
    items: ContentItem[],
    userId: string
  ): Promise<Map<string, number[]>> {
    const embeddings = new Map<string, number[]>();

    // Create pseudo-chunks from content items
    const chunks = items.map((item) => ({
      id: item.id,
      docId: item.id,
      content: `${item.title}\n\n${item.snippet ?? item.content.slice(0, 500)}`,
      startOffset: 0,
      endOffset: 0,
      metadata: {},
    }));

    const results = await this.embeddingService.embedChunks(chunks, userId);

    for (const result of results) {
      embeddings.set(result.chunkId, result.embedding);
    }

    return embeddings;
  }

  /**
   * Perform agglomerative (hierarchical) clustering.
   */
  private agglomerativeClustering(
    items: ContentItem[],
    embeddings: Map<string, number[]>,
    threshold: number,
    maxClusters: number
  ): ContentCluster[] {
    // Initialize each item as its own cluster
    const clusters: Array<{
      id: string;
      items: ContentItem[];
      centroid: number[];
    }> = [];

    for (const item of items) {
      const embedding = embeddings.get(item.id);
      if (embedding) {
        clusters.push({
          id: this.generateId(),
          items: [item],
          centroid: embedding,
        });
      }
    }

    // Merge clusters until threshold or maxClusters reached
    while (clusters.length > maxClusters) {
      const merge = this.findBestMerge(clusters, threshold);
      if (!merge) {
        break;
      }

      const { i, j, similarity } = merge;
      if (similarity < threshold) {
        break;
      }

      // Merge cluster j into cluster i
      const merged = this.mergeClusters(clusters[i], clusters[j]);
      clusters[i] = merged;
      clusters.splice(j, 1);
    }

    // Convert to ContentCluster format
    return clusters.map((cluster) => this.toContentCluster(cluster, embeddings));
  }

  /**
   * Find the best pair of clusters to merge.
   * Returns null if no pair exceeds the similarity threshold.
   */
  private findBestMerge(
    clusters: Array<{ id: string; items: ContentItem[]; centroid: number[] }>,
    threshold: number
  ): { i: number; j: number; similarity: number } | null {
    let bestI = -1;
    let bestJ = -1;
    let bestSimilarity = -1;

    for (let i = 0; i < clusters.length; i++) {
      for (let j = i + 1; j < clusters.length; j++) {
        const similarity = this.cosineSimilarity(clusters[i].centroid, clusters[j].centroid);
        if (similarity > bestSimilarity) {
          bestSimilarity = similarity;
          bestI = i;
          bestJ = j;
        }
      }
    }

    // Only return a merge if it exceeds threshold
    if (bestI === -1 || bestSimilarity < threshold) {
      return null;
    }

    return { i: bestI, j: bestJ, similarity: bestSimilarity };
  }

  /**
   * Merge two clusters.
   */
  private mergeClusters(
    a: { id: string; items: ContentItem[]; centroid: number[] },
    b: { id: string; items: ContentItem[]; centroid: number[] }
  ): { id: string; items: ContentItem[]; centroid: number[] } {
    const items = [...a.items, ...b.items];

    // Calculate new centroid as weighted average
    const centroid: number[] = [];
    const aWeight = a.items.length;
    const bWeight = b.items.length;
    const totalWeight = aWeight + bWeight;

    for (let i = 0; i < a.centroid.length; i++) {
      centroid[i] = (a.centroid[i] * aWeight + b.centroid[i] * bWeight) / totalWeight;
    }

    return { id: a.id, items, centroid };
  }

  /**
   * Convert internal cluster to ContentCluster format.
   */
  private toContentCluster(
    cluster: { id: string; items: ContentItem[]; centroid: number[] },
    embeddings: Map<string, number[]>
  ): ContentCluster {
    // Calculate similarity of each item to centroid
    const clusteredItems: ClusteredItem[] = cluster.items.map((item) => {
      const embedding = embeddings.get(item.id);
      const similarity = embedding ? this.cosineSimilarity(embedding, cluster.centroid) : 0;
      return {
        item,
        similarityToCentroid: similarity,
        isRepresentative: false,
      };
    });

    // Mark most central item as representative
    clusteredItems.sort((a, b) => b.similarityToCentroid - a.similarityToCentroid);
    if (clusteredItems.length > 0) {
      clusteredItems[0].isRepresentative = true;
    }

    // Calculate cluster cohesion (average similarity)
    const cohesion =
      clusteredItems.reduce((sum, i) => sum + i.similarityToCentroid, 0) / clusteredItems.length;

    // Collect unique topics
    const topicCounts = new Map<string, number>();
    for (const item of cluster.items) {
      for (const topic of item.topics) {
        topicCounts.set(topic, (topicCounts.get(topic) ?? 0) + 1);
      }
    }
    const topics = Array.from(topicCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([topic]) => topic);

    // Calculate relevance score based on recency and cohesion
    const avgRecency = this.calculateAvgRecency(cluster.items);
    const relevanceScore = cohesion * 0.4 + avgRecency * 0.4 + (cluster.items.length / 10) * 0.2;

    return {
      id: cluster.id,
      title: clusteredItems[0]?.item.title ?? "Untitled Cluster",
      summary: "",
      items: clusteredItems,
      cohesion,
      topics,
      relevanceScore,
    };
  }

  /**
   * Calculate average recency score for items.
   */
  private calculateAvgRecency(items: ContentItem[]): number {
    const now = Date.now();
    const scores = items.map((item) => {
      const ageHours = (now - item.ingestedAt) / (60 * 60 * 1000);
      return Math.exp(-0.0578 * ageHours); // Same decay as DigestService
    });
    return scores.reduce((a, b) => a + b, 0) / scores.length;
  }

  /**
   * Label clusters using LLM.
   */
  private async labelClusters(
    clusters: ContentCluster[],
    userId: string
  ): Promise<ContentCluster[]> {
    const labeled: ContentCluster[] = [];

    for (const cluster of clusters) {
      const titles = cluster.items.map((i) => i.item.title).slice(0, 5);
      const snippets = cluster.items
        .map((i) => i.item.snippet ?? i.item.content.slice(0, 200))
        .slice(0, 3);

      try {
        const prompt = `Given these related articles:

Titles:
${titles.map((t, i) => `${i + 1}. ${t}`).join("\n")}

Snippets:
${snippets.map((s, i) => `${i + 1}. ${s}`).join("\n\n")}

Generate:
1. A concise cluster title (max 10 words) that captures the common theme
2. A brief summary (2-3 sentences) of what these articles cover

Respond in JSON format:
{"title": "...", "summary": "..."}`;

        const response = await this.gateway.complete([{ role: "user", content: prompt }], userId);

        const parsed = this.parseJsonResponse(response.content);
        labeled.push({
          ...cluster,
          title: parsed?.title ?? cluster.title,
          summary: parsed?.summary ?? "",
        });
      } catch {
        // Keep original title if LLM fails
        labeled.push(cluster);
      }
    }

    return labeled;
  }

  /**
   * Parse JSON response from LLM, handling common formatting issues.
   */
  private parseJsonResponse(content: string): { title?: string; summary?: string } | null {
    try {
      // Try direct parse first
      return JSON.parse(content);
    } catch {
      // Try extracting JSON from markdown code blocks
      const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) {
        try {
          return JSON.parse(jsonMatch[1].trim());
        } catch {
          // Fall through to next attempt
        }
      }

      // Try finding JSON object pattern in text
      const objectMatch = content.match(/\{[\s\S]*"title"[\s\S]*"summary"[\s\S]*\}/);
      if (objectMatch) {
        try {
          return JSON.parse(objectMatch[0]);
        } catch {
          // Fall through
        }
      }

      return null;
    }
  }

  /**
   * Calculate cosine similarity between two vectors.
   */
  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) {
      return 0;
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    const denominator = Math.sqrt(normA) * Math.sqrt(normB);
    if (denominator === 0) {
      return 0;
    }

    return dotProduct / denominator;
  }

  /**
   * Generate unique ID.
   */
  private generateId(): string {
    return `cluster-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  }

  /**
   * Calculate clustering statistics.
   */
  private calculateStats(
    items: ContentItem[],
    clusters: ContentCluster[],
    startTime: number
  ): ClusteringStats {
    const clusteredItems = clusters.reduce((sum, c) => sum + c.items.length, 0);
    const avgClusterSize = clusters.length > 0 ? clusteredItems / clusters.length : 0;
    const avgCohesion =
      clusters.length > 0 ? clusters.reduce((sum, c) => sum + c.cohesion, 0) / clusters.length : 0;

    return {
      totalItems: items.length,
      clusteredItems,
      clusterCount: clusters.length,
      avgClusterSize,
      avgCohesion,
      processingTimeMs: Date.now() - startTime,
    };
  }

  /**
   * Return empty result.
   */
  private emptyResult(startTime: number): ClusteringResult {
    return {
      clusters: [],
      unclustered: [],
      stats: {
        totalItems: 0,
        clusteredItems: 0,
        clusterCount: 0,
        avgClusterSize: 0,
        avgCohesion: 0,
        processingTimeMs: Date.now() - startTime,
      },
    };
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a clustering service.
 */
export function createClusteringService(
  embeddingService: EmbeddingService,
  gateway: AIGateway,
  config?: Partial<ClusteringConfig>
): ClusteringService {
  return new ClusteringService(embeddingService, gateway, config);
}
