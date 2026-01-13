/**
 * Lane Router
 *
 * Routes requests to the appropriate model lane (Fast/Deep/Consensus)
 * with support for BYOK (Bring Your Own Key) and automatic lane selection.
 *
 * Track B: Intelligence & Grounding
 */

import { ProviderRouter, type ProviderRouterConfig } from "../providers/providerRouter";
import type { LLMProvider, StreamChunk, TokenUsage } from "../providers/types";
import type {
  ConsensusConfig,
  ConsensusModelResult,
  ConsensusResult,
  LaneCompletionRequest,
  LaneCompletionResponse,
  LaneConfig,
  LaneLogger,
  LaneModelConfig,
  LaneRouterConfig,
  LaneSelectionContext,
  LaneTelemetryEvent,
  ModelLane,
} from "./types";

// ============================================================================
// Lane Router Implementation
// ============================================================================

/**
 * Lane Router - Routes requests to appropriate model lanes.
 *
 * Supports three lane types:
 * - fast: Quick responses using smaller/faster models (Haiku, GPT-4o-mini)
 * - deep: Thorough responses using larger models (Opus, GPT-4o)
 * - consensus: Parallel execution with result merging
 */
export class LaneRouter {
  private readonly lanes = new Map<ModelLane, ProviderRouter>();
  private readonly laneConfigs = new Map<ModelLane, LaneConfig>();
  private readonly config: LaneRouterConfig;
  private readonly logger: LaneLogger;

  constructor(
    config: LaneRouterConfig,
    private readonly providerFactory: ProviderFactory
  ) {
    this.config = config;
    this.logger = config.logger ?? createNoopLogger();

    // Initialize a ProviderRouter for each configured lane
    for (const [laneName, laneConfig] of Object.entries(config.lanes)) {
      if (laneConfig) {
        const lane = laneName as ModelLane;
        this.laneConfigs.set(lane, laneConfig);

        if (lane !== "consensus") {
          this.lanes.set(lane, this.createLaneRouter(laneConfig));
        }
      }
    }

    this.logger.info("LaneRouter initialized", {
      lanes: Array.from(this.lanes.keys()),
      defaultLane: config.defaultLane,
    });
  }

  /**
   * Complete a request using the appropriate lane.
   */
  async complete(request: LaneCompletionRequest): Promise<LaneCompletionResponse> {
    const startTime = Date.now();
    const lane = this.selectLane(request);

    this.emitTelemetry({
      kind: "lane_selected",
      timestamp: startTime,
      lane,
      metadata: { requestedLane: request.lane },
    });

    try {
      if (lane === "consensus") {
        return this.executeConsensus(request, startTime);
      }

      return this.executeOnLane(lane, request, startTime);
    } catch (error) {
      this.emitTelemetry({
        kind: "error",
        timestamp: Date.now(),
        lane,
        error: error instanceof Error ? error.message : String(error),
        durationMs: Date.now() - startTime,
      });
      throw error;
    }
  }

  /**
   * Stream a request using the appropriate lane.
   * Note: Consensus lane falls back to non-streaming.
   */
  async *stream(request: LaneCompletionRequest): AsyncIterable<StreamChunk & { lane: ModelLane }> {
    const startTime = Date.now();
    const lane = this.selectLane(request);

    // Consensus doesn't support streaming - fall back to complete
    if (lane === "consensus") {
      const response = await this.executeConsensus(request, startTime);
      yield {
        type: "content",
        content: response.content,
        lane,
      };
      yield {
        type: "usage",
        usage: response.usage,
        lane,
      };
      yield { type: "done", lane };
      return;
    }

    const router = this.lanes.get(lane);
    if (!router) {
      throw new Error(`Lane "${lane}" is not configured`);
    }

    const laneConfig = this.laneConfigs.get(lane);
    const model = request.model ?? laneConfig?.models[0]?.modelId;

    for await (const chunk of router.stream({
      model: model ?? this.config.defaultLane,
      messages: request.messages,
      temperature: request.temperature,
      maxTokens: request.maxTokens,
      timeoutMs: request.timeoutMs,
    })) {
      yield { ...chunk, lane };
    }
  }

  /**
   * Get available lanes.
   */
  getAvailableLanes(): ModelLane[] {
    const lanes: ModelLane[] = Array.from(this.lanes.keys());
    if (this.laneConfigs.has("consensus")) {
      lanes.push("consensus");
    }
    return lanes;
  }

  /**
   * Check if a lane is configured.
   */
  hasLane(lane: ModelLane): boolean {
    return this.lanes.has(lane) || (lane === "consensus" && this.laneConfigs.has("consensus"));
  }

  /**
   * Get lane configuration.
   */
  getLaneConfig(lane: ModelLane): LaneConfig | undefined {
    return this.laneConfigs.get(lane);
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  /**
   * Select the appropriate lane for a request.
   */
  private selectLane(request: LaneCompletionRequest): ModelLane {
    // Explicit lane request takes precedence
    if (request.lane && this.hasLane(request.lane)) {
      return request.lane;
    }

    // Use auto-selector if configured
    if (this.config.autoSelect) {
      const context: LaneSelectionContext = {
        userPreference: request.lane,
        complexityHints: request.complexityHints,
        metadata: request.metadata,
      };
      const selected = this.config.autoSelect(request, context);
      if (this.hasLane(selected)) {
        return selected;
      }
    }

    return this.config.defaultLane;
  }

  /**
   * Execute request on a specific lane.
   */
  private async executeOnLane(
    lane: ModelLane,
    request: LaneCompletionRequest,
    startTime: number
  ): Promise<LaneCompletionResponse> {
    const router = this.lanes.get(lane);
    if (!router) {
      // Try fallback lane
      const laneConfig = this.laneConfigs.get(lane);
      if (laneConfig?.fallbackLane && this.lanes.has(laneConfig.fallbackLane)) {
        this.emitTelemetry({
          kind: "fallback",
          timestamp: Date.now(),
          lane,
          metadata: { fallbackTo: laneConfig.fallbackLane },
        });
        return this.executeOnLane(laneConfig.fallbackLane, request, startTime);
      }
      throw new Error(`Lane "${lane}" is not configured and has no fallback`);
    }

    const laneConfig = this.laneConfigs.get(lane);
    const model = request.model ?? laneConfig?.models[0]?.modelId;

    const response = await router.complete({
      model: model ?? "",
      messages: request.messages,
      temperature: request.temperature,
      maxTokens: request.maxTokens,
      timeoutMs: request.timeoutMs,
    });

    const latencyMs = Date.now() - startTime;

    this.emitTelemetry({
      kind: "model_called",
      timestamp: Date.now(),
      lane,
      model: response.model,
      durationMs: latencyMs,
      usage: response.usage,
    });

    return {
      content: response.content,
      lane,
      model: response.model,
      provider: this.getProviderFromModel(lane, response.model),
      usage: response.usage,
      latencyMs,
      finishReason: response.finishReason ?? "stop",
    };
  }

  /**
   * Execute consensus across multiple models.
   */
  private async executeConsensus(
    request: LaneCompletionRequest,
    startTime: number
  ): Promise<LaneCompletionResponse> {
    const consensusConfig = this.config.consensus ?? {
      mergeStrategy: "weighted_vote",
      minAgreement: 2,
      modelTimeoutMs: 30000,
      maxParallelCalls: 3,
    };

    const laneConfig = this.laneConfigs.get("consensus");
    if (!laneConfig || laneConfig.models.length < 2) {
      throw new Error("Consensus lane requires at least 2 models configured");
    }

    const modelResults = await this.executeModelsInParallel(
      laneConfig.models,
      request,
      consensusConfig
    );

    const successfulResults = modelResults.filter((r) => r.success);
    if (successfulResults.length === 0) {
      throw new Error("All consensus models failed");
    }

    const consensusResult = this.mergeResults(successfulResults, consensusConfig);
    const latencyMs = Date.now() - startTime;

    this.emitTelemetry({
      kind: "consensus_executed",
      timestamp: Date.now(),
      lane: "consensus",
      durationMs: latencyMs,
      usage: consensusResult.totalUsage,
      metadata: {
        modelsUsed: successfulResults.length,
        agreementScore: consensusResult.agreementScore,
      },
    });

    return {
      content: consensusResult.content,
      lane: "consensus",
      model: successfulResults.map((r) => r.modelId).join("+"),
      provider: successfulResults.map((r) => r.providerId).join("+"),
      usage: consensusResult.totalUsage,
      latencyMs,
      finishReason: "stop",
      consensus: consensusResult,
    };
  }

  /**
   * Execute multiple models in parallel for consensus.
   */
  private async executeModelsInParallel(
    models: LaneModelConfig[],
    request: LaneCompletionRequest,
    config: ConsensusConfig
  ): Promise<ConsensusModelResult[]> {
    const maxParallel = config.maxParallelCalls ?? models.length;
    const timeout = config.modelTimeoutMs ?? 30000;

    const promises = models.slice(0, maxParallel).map(async (modelConfig) => {
      const startTime = Date.now();

      try {
        const provider = await this.providerFactory.getOrCreate(modelConfig);
        const response = await this.withTimeout(
          provider.complete({
            model: modelConfig.modelId,
            messages: request.messages,
            temperature: request.temperature,
            maxTokens: modelConfig.maxTokens ?? request.maxTokens,
          }),
          timeout,
          modelConfig.modelId
        );

        return {
          providerId: modelConfig.providerId,
          modelId: modelConfig.modelId,
          content: response.content,
          weight: modelConfig.weight ?? 1.0,
          latencyMs: Date.now() - startTime,
          usage: response.usage,
          success: true,
        };
      } catch (error) {
        return {
          providerId: modelConfig.providerId,
          modelId: modelConfig.modelId,
          content: "",
          weight: modelConfig.weight ?? 1.0,
          latencyMs: Date.now() - startTime,
          usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    });

    return Promise.all(promises);
  }

  /**
   * Merge results from multiple models based on strategy.
   */
  private mergeResults(results: ConsensusModelResult[], config: ConsensusConfig): ConsensusResult {
    const totalUsage: TokenUsage = results.reduce(
      (acc, r) => ({
        inputTokens: acc.inputTokens + r.usage.inputTokens,
        outputTokens: acc.outputTokens + r.usage.outputTokens,
        totalTokens: acc.totalTokens + r.usage.totalTokens,
      }),
      { inputTokens: 0, outputTokens: 0, totalTokens: 0 }
    );

    const totalLatency = Math.max(...results.map((r) => r.latencyMs));

    // Simple merge strategy: use weighted vote (highest weighted response)
    let content: string;
    let agreementScore: number;

    switch (config.mergeStrategy) {
      case "weighted_vote": {
        // Select response with highest weight
        const sorted = [...results].sort((a, b) => b.weight - a.weight);
        content = sorted[0].content;
        agreementScore = this.calculateAgreementScore(results);
        break;
      }
      case "majority": {
        // Find most common response (by content similarity)
        content = this.findMajorityResponse(results);
        agreementScore = this.calculateAgreementScore(results);
        break;
      }
      default: {
        // Covers: best_confidence, union, intersection
        // Default: use first successful response
        content = results[0].content;
        agreementScore = results.length > 1 ? 0.5 : 1.0;
      }
    }

    return {
      content,
      modelResults: results,
      agreementScore,
      differences: config.includeDiff ? this.computeDifferences(results) : undefined,
      totalUsage,
      totalLatencyMs: totalLatency,
    };
  }

  /**
   * Calculate agreement score between model responses.
   */
  private calculateAgreementScore(results: ConsensusModelResult[]): number {
    if (results.length < 2) {
      return 1.0;
    }

    // Simple heuristic: compare content lengths and check for similar structure
    const lengths = results.map((r) => r.content.length);
    const avgLength = lengths.reduce((a, b) => a + b, 0) / lengths.length;
    const variance = lengths.reduce((sum, l) => sum + (l - avgLength) ** 2, 0) / lengths.length;
    const stdDev = Math.sqrt(variance);

    // Lower variance = higher agreement
    const lengthAgreement = Math.max(0, 1 - stdDev / avgLength);

    // Check for common phrases (simplified)
    const commonWords = this.findCommonWords(results.map((r) => r.content));
    const wordAgreement = Math.min(1, commonWords / 10);

    return (lengthAgreement + wordAgreement) / 2;
  }

  /**
   * Find majority response by content similarity.
   */
  private findMajorityResponse(results: ConsensusModelResult[]): string {
    // Simple: return the one with median length
    const sorted = [...results].sort((a, b) => a.content.length - b.content.length);
    return sorted[Math.floor(sorted.length / 2)].content;
  }

  /**
   * Find common words across responses.
   */
  private findCommonWords(contents: string[]): number {
    if (contents.length === 0) {
      return 0;
    }

    const wordSets = contents.map(
      (c) =>
        new Set(
          c
            .toLowerCase()
            .split(/\s+/)
            .filter((w) => w.length > 3)
        )
    );

    const firstSet = wordSets[0];
    let commonCount = 0;

    for (const word of firstSet) {
      if (wordSets.every((set) => set.has(word))) {
        commonCount++;
      }
    }

    return commonCount;
  }

  /**
   * Compute differences between model responses.
   */
  private computeDifferences(results: ConsensusModelResult[]): Array<{
    type: "addition" | "removal" | "change";
    content: string;
    presentIn: string[];
    absentIn: string[];
  }> {
    // Simplified diff: just note which models gave different lengths
    const avgLength = results.reduce((sum, r) => sum + r.content.length, 0) / results.length;

    return results
      .filter((r) => Math.abs(r.content.length - avgLength) > avgLength * 0.3)
      .map((r) => ({
        type: r.content.length > avgLength ? ("addition" as const) : ("removal" as const),
        content: `${r.modelId}: ${r.content.length > avgLength ? "longer" : "shorter"} response`,
        presentIn: [r.modelId],
        absentIn: results.filter((o) => o.modelId !== r.modelId).map((o) => o.modelId),
      }));
  }

  /**
   * Create a ProviderRouter for a lane.
   */
  private createLaneRouter(laneConfig: LaneConfig): ProviderRouter {
    const providers: LLMProvider[] = [];

    for (const modelConfig of laneConfig.models) {
      const provider = this.providerFactory.createSync(modelConfig);
      if (provider) {
        providers.push(provider);
      }
    }

    if (providers.length === 0) {
      throw new Error(`No providers could be created for lane "${laneConfig.lane}"`);
    }

    const routerConfig: ProviderRouterConfig = {
      primaryProvider: providers[0].name,
      fallbackOrder: providers.map((p) => p.name),
      enableFallback: laneConfig.enableFallback ?? true,
    };

    const router = new ProviderRouter(routerConfig);
    for (const provider of providers) {
      router.registerProvider(provider);
    }

    return router;
  }

  /**
   * Get provider name from model identifier.
   */
  private getProviderFromModel(lane: ModelLane, model: string): string {
    const laneConfig = this.laneConfigs.get(lane);
    const modelConfig = laneConfig?.models.find((m) => m.modelId === model);
    return modelConfig?.providerId ?? "unknown";
  }

  /**
   * Wrap a promise with a timeout that properly cleans up.
   */
  private withTimeout<T>(promise: Promise<T>, timeoutMs: number, modelId: string): Promise<T> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Model ${modelId} timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      promise
        .then((result) => {
          clearTimeout(timer);
          resolve(result);
        })
        .catch((error) => {
          clearTimeout(timer);
          reject(error);
        });
    });
  }

  /**
   * Emit telemetry event.
   */
  private emitTelemetry(event: LaneTelemetryEvent): void {
    this.config.onTelemetry?.(event);
  }
}

// ============================================================================
// Provider Factory Interface
// ============================================================================

/**
 * Factory for creating LLM providers from lane model configs.
 * This allows the LaneRouter to be decoupled from specific provider implementations.
 */
export interface ProviderFactory {
  /** Create a provider synchronously (for initial setup) */
  createSync(config: LaneModelConfig): LLMProvider | null;
  /** Get or create a provider (for runtime use) */
  getOrCreate(config: LaneModelConfig): Promise<LLMProvider>;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Create a no-op logger.
 */
function createNoopLogger(): LaneLogger {
  return {
    debug: () => undefined,
    info: () => undefined,
    warn: () => undefined,
    error: () => undefined,
  };
}

/**
 * Create a lane router with a provider factory.
 */
export function createLaneRouter(
  config: LaneRouterConfig,
  providerFactory: ProviderFactory
): LaneRouter {
  return new LaneRouter(config, providerFactory);
}
