/**
 * Consensus Orchestrator
 *
 * Manages parallel LLM calls with voting-based consensus for improved reliability.
 * Supports multiple voting strategies: majority, unanimous, and weighted.
 */

// ============================================================================
// Types
// ============================================================================

/** Model configuration for consensus calls */
export interface ConsensusModelConfig {
  /** Provider identifier (e.g., "openai", "anthropic") */
  providerId: string;
  /** Model identifier (e.g., "gpt-4o", "claude-3-opus") */
  modelId: string;
  /** Optional weight for weighted voting (default: 1.0) */
  weight?: number;
  /** API key for this provider */
  apiKey?: string;
  /** Base URL for this provider */
  baseUrl?: string;
}

/** Voting strategy for determining consensus */
export type VotingStrategy = "majority" | "unanimous" | "weighted";

/** Configuration for consensus execution */
export interface ConsensusConfig {
  /** Models to query in parallel */
  models: ConsensusModelConfig[];
  /** Voting strategy to use */
  votingStrategy: VotingStrategy;
  /** Minimum agreement threshold (0-1, default: 0.5 for majority) */
  minAgreement?: number;
  /** Timeout per model call in ms (default: 30000) */
  timeoutMs?: number;
  /** Whether to continue if some models fail (default: true) */
  tolerateFailures?: boolean;
}

/** Individual model response */
export interface ModelResponse {
  /** Model configuration used */
  model: ConsensusModelConfig;
  /** The response content */
  content: string;
  /** Whether this call succeeded */
  success: boolean;
  /** Error message if failed */
  error?: string;
  /** Latency in milliseconds */
  latencyMs: number;
  /** Token usage if available */
  tokenUsage?: {
    prompt: number;
    completion: number;
    total: number;
  };
}

/** Result of consensus voting */
export interface ConsensusResult {
  /** Final agreed-upon answer */
  finalAnswer: string;
  /** Confidence score (0-1) based on agreement */
  confidence: number;
  /** Agreement ratio (0-1) */
  agreement: number;
  /** All model responses */
  modelResponses: ModelResponse[];
  /** Whether consensus was reached */
  hasConsensus: boolean;
  /** Dissenting responses */
  dissenting: ModelResponse[];
  /** Total execution time in ms */
  totalDurationMs: number;
  /** Voting strategy used */
  votingStrategy: VotingStrategy;
}

// ============================================================================
// Similarity & Voting
// ============================================================================

/**
 * Calculate semantic similarity between two responses.
 * Uses simple Jaccard similarity on normalized tokens.
 * (Can be enhanced with embeddings for production use)
 */
function calculateSimilarity(a: string, b: string): number {
  const normalize = (s: string) =>
    s
      .toLowerCase()
      .replace(/[^\w\s]/g, "")
      .split(/\s+/)
      .filter(Boolean);

  const tokensA = new Set(normalize(a));
  const tokensB = new Set(normalize(b));

  if (tokensA.size === 0 && tokensB.size === 0) {
    return 1.0;
  }
  if (tokensA.size === 0 || tokensB.size === 0) {
    return 0.0;
  }

  const intersection = new Set([...tokensA].filter((x) => tokensB.has(x)));
  const union = new Set([...tokensA, ...tokensB]);

  return intersection.size / union.size;
}

/**
 * Find the response cluster with highest agreement.
 * Uses similarity threshold to group similar responses.
 */
function findConsensusCluster(
  responses: ModelResponse[],
  config: ConsensusConfig
): { cluster: ModelResponse[]; representative: ModelResponse } {
  const successfulResponses = responses.filter((r) => r.success);

  if (successfulResponses.length === 0) {
    throw new Error("No successful responses to form consensus");
  }

  if (successfulResponses.length === 1) {
    return {
      cluster: successfulResponses,
      representative: successfulResponses[0],
    };
  }

  // Calculate pairwise similarities
  const similarityThreshold = 0.6;
  const clusters: ModelResponse[][] = [];

  for (const response of successfulResponses) {
    let addedToCluster = false;

    for (const cluster of clusters) {
      const representative = cluster[0];
      const similarity = calculateSimilarity(response.content, representative.content);

      if (similarity >= similarityThreshold) {
        cluster.push(response);
        addedToCluster = true;
        break;
      }
    }

    if (!addedToCluster) {
      clusters.push([response]);
    }
  }

  // Find largest cluster (or highest weight for weighted strategy)
  let bestCluster = clusters[0];
  let bestScore = 0;

  for (const cluster of clusters) {
    let score: number;

    if (config.votingStrategy === "weighted") {
      score = cluster.reduce((sum, r) => sum + (r.model.weight ?? 1.0), 0);
    } else {
      score = cluster.length;
    }

    if (score > bestScore) {
      bestScore = score;
      bestCluster = cluster;
    }
  }

  // Pick representative with lowest latency
  const representative = bestCluster.reduce((best, current) =>
    current.latencyMs < best.latencyMs ? current : best
  );

  return { cluster: bestCluster, representative };
}

/**
 * Check if consensus threshold is met based on voting strategy.
 */
function checkConsensus(clusterSize: number, totalSize: number, config: ConsensusConfig): boolean {
  const agreement = clusterSize / totalSize;
  const minAgreement = config.minAgreement ?? 0.5;

  switch (config.votingStrategy) {
    case "unanimous":
      return clusterSize === totalSize;
    case "majority":
      return agreement > 0.5;
    case "weighted":
      return agreement >= minAgreement;
    default:
      return agreement >= minAgreement;
  }
}

// ============================================================================
// Consensus Orchestrator
// ============================================================================

/**
 * Orchestrates parallel LLM calls and determines consensus.
 */
export class ConsensusOrchestrator {
  /**
   * Execute consensus query across multiple models.
   */
  async executeConsensus(
    prompt: string,
    config: ConsensusConfig,
    options: {
      signal?: AbortSignal;
      onModelResponse?: (response: ModelResponse) => void;
    } = {}
  ): Promise<ConsensusResult> {
    const startTime = Date.now();
    const { models, tolerateFailures = true, timeoutMs = 30000 } = config;

    if (models.length === 0) {
      throw new Error("At least one model is required for consensus");
    }

    // Execute all model calls in parallel
    const responsePromises = models.map((model) =>
      this.callModel(prompt, model, timeoutMs, options.signal)
    );

    const responses = await Promise.all(responsePromises);

    // Notify listeners of individual responses
    for (const response of responses) {
      options.onModelResponse?.(response);
    }

    const successfulResponses = responses.filter((r) => r.success);

    // Check if we have enough successful responses
    if (successfulResponses.length === 0) {
      return {
        finalAnswer: "",
        confidence: 0,
        agreement: 0,
        modelResponses: responses,
        hasConsensus: false,
        dissenting: [],
        totalDurationMs: Date.now() - startTime,
        votingStrategy: config.votingStrategy,
      };
    }

    if (!tolerateFailures && successfulResponses.length < models.length) {
      throw new Error(
        `Only ${successfulResponses.length}/${models.length} models responded successfully`
      );
    }

    // Find consensus
    const { cluster, representative } = findConsensusCluster(responses, config);
    const clusterModelIds = new Set(cluster.map((r) => r.model.modelId));
    const dissenting = successfulResponses.filter((r) => !clusterModelIds.has(r.model.modelId));

    const agreement = cluster.length / successfulResponses.length;
    const hasConsensus = checkConsensus(cluster.length, successfulResponses.length, config);

    // Calculate confidence based on agreement and response quality
    const confidence = hasConsensus ? agreement * 0.8 + 0.2 : agreement * 0.5;

    return {
      finalAnswer: representative.content,
      confidence,
      agreement,
      modelResponses: responses,
      hasConsensus,
      dissenting,
      totalDurationMs: Date.now() - startTime,
      votingStrategy: config.votingStrategy,
    };
  }

  /**
   * Call a single model with timeout and error handling.
   */
  private async callModel(
    prompt: string,
    model: ConsensusModelConfig,
    timeoutMs: number,
    signal?: AbortSignal
  ): Promise<ModelResponse> {
    const startTime = Date.now();

    try {
      // Create abort controller for timeout
      const timeoutController = new AbortController();
      const timeoutId = setTimeout(() => timeoutController.abort(), timeoutMs);

      // Combine signals
      const combinedSignal = signal
        ? AbortSignal.any([signal, timeoutController.signal])
        : timeoutController.signal;

      try {
        const content = await this.invokeLLM(prompt, model, combinedSignal);

        return {
          model,
          content,
          success: true,
          latencyMs: Date.now() - startTime,
        };
      } finally {
        clearTimeout(timeoutId);
      }
    } catch (error) {
      return {
        model,
        content: "",
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
        latencyMs: Date.now() - startTime,
      };
    }
  }

  /**
   * Invoke a specific LLM. Override this for custom integrations.
   */
  protected async invokeLLM(
    prompt: string,
    model: ConsensusModelConfig,
    signal: AbortSignal
  ): Promise<string> {
    // Default implementation using fetch to OpenAI-compatible API
    const baseUrl = model.baseUrl ?? this.getDefaultBaseUrl(model.providerId);
    const apiKey = model.apiKey;

    if (!apiKey) {
      throw new Error(`API key required for ${model.providerId}`);
    }

    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: model.modelId,
        messages: [{ role: "user", content: prompt }],
        max_tokens: 2048,
      }),
      signal,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`${model.providerId} API error: ${response.status} - ${errorText}`);
    }

    const data = (await response.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    return data.choices?.[0]?.message?.content ?? "";
  }

  private getDefaultBaseUrl(providerId: string): string {
    const defaults: Record<string, string> = {
      openai: "https://api.openai.com/v1",
      anthropic: "https://api.anthropic.com/v1",
      deepseek: "https://api.deepseek.com/v1",
      moonshot: "https://api.moonshot.cn/v1",
    };
    return defaults[providerId] ?? "";
  }
}

/**
 * Create a consensus orchestrator instance.
 */
export function createConsensusOrchestrator(): ConsensusOrchestrator {
  return new ConsensusOrchestrator();
}
