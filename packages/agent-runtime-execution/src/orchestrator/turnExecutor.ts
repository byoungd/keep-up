/**
 * Turn Executor
 *
 * Encapsulates the logic for executing a single agent turn.
 * Handles LLM interaction, message compression, caching, and knowledge injection.
 *
 * @example
 * ```typescript
 * const executor = createTurnExecutor({
 *   llm: myLLM,
 *   messageCompressor: createMessageCompressor(),
 *   requestCache: createRequestCache(),
 *   getToolDefinitions: () => registry.listTools(),
 * });
 *
 * const outcome = await executor.execute(agentState);
 * if (outcome.type === 'tool_use') {
 *   // Handle tool calls
 * }
 * ```
 *
 * @module orchestrator/turnExecutor
 */

import type { IMetricsCollector, SpanContext } from "@ku0/agent-runtime-telemetry/telemetry";
import { AGENT_METRICS } from "@ku0/agent-runtime-telemetry/telemetry";
import type { SkillRegistry } from "@ku0/agent-runtime-tools";
import { SkillPromptAdapter, type SkillPromptOptions } from "@ku0/agent-runtime-tools";
import {
  type ContextCompactor,
  type ContextFrameBuilder,
  type ContextFrameOutput,
  type ContextItem,
  type ContextManager,
  type ContextMessage,
  type ContextToolCall,
  type ContextToolResult,
  createContextCompactor,
} from "../context";
import type { KnowledgeMatchResult, KnowledgeRegistry } from "../knowledge";
import type { SymbolContextProvider } from "../lsp";
import { AGENTS_GUIDE_PROMPT } from "../prompts/agentGuidelines";
import { getModelCapabilityCache } from "../routing/modelCapabilityCache";
import type { ModelRouter, ModelRoutingDecision } from "../routing/modelRouter";
import type {
  AgentMessage,
  AgentState,
  AuditLogger,
  ContextCompressionConfig,
  MCPToolCall,
  TokenUsageStats,
} from "../types";
import type { AgentLLMRequest, AgentLLMResponse, AgentToolDefinition, IAgentLLM } from "./llmTypes";
import type { MessageCompressor } from "./messageCompression";
import type { RequestCache } from "./requestCache";

// ============================================================================
// Types
// ============================================================================

/** Possible outcomes of a turn execution */
export type TurnOutcomeType = "complete" | "tool_use" | "error";

/**
 * Result of executing a single agent turn.
 * Contains the LLM response, any tool calls, and performance metrics.
 */
export interface TurnOutcome {
  /** The type of outcome */
  readonly type: TurnOutcomeType;
  /** The raw LLM response (undefined on error) */
  readonly response?: AgentLLMResponse;
  /** The model used for the response (when available) */
  readonly modelId?: string;
  /** The assistant message to add to conversation history */
  readonly assistantMessage?: AgentMessage;
  /** Tool calls requested by the LLM (only when type is 'tool_use') */
  readonly toolCalls?: MCPToolCall[];
  /** Error message (only when type is 'error') */
  readonly error?: string;
  /** Performance metrics for the turn */
  readonly metrics: TurnMetrics;
  /** Compressed message history used for the request */
  readonly compressedMessages?: AgentMessage[];
  /** Token usage for the turn */
  readonly usage?: TokenUsageStats;
}

/**
 * Performance metrics collected during turn execution.
 */
export interface TurnMetrics {
  /** Message compression ratio (0 = no compression) */
  readonly compressionRatio: number;
  /** Time spent on compression in milliseconds */
  readonly compressionTimeMs: number;
  /** Whether the response was served from cache */
  readonly cacheHit: boolean;
  /** Time spent on cache operations in milliseconds */
  readonly cacheTimeMs: number;
  /** Number of knowledge items matched */
  readonly knowledgeMatched: number;
  /** Total turn execution time in milliseconds */
  readonly totalTimeMs: number;
}

/**
 * Dependencies required by the TurnExecutor.
 * All components are injectable for testing and customization.
 */
export interface TurnExecutorDependencies {
  /** LLM provider for generating completions */
  readonly llm: IAgentLLM;
  /** Message compressor for context window management */
  readonly messageCompressor: MessageCompressor;
  /** Request cache for response deduplication */
  readonly requestCache: RequestCache;
  /** Optional context frame builder */
  readonly contextFrameBuilder?: ContextFrameBuilder;
  /** Optional context items provider */
  readonly getContextItems?: () => ContextItem[];
  /** Optional knowledge registry for context injection */
  readonly knowledgeRegistry?: KnowledgeRegistry;
  /** Optional symbol context provider for semantic code perception */
  readonly symbolContextProvider?: SymbolContextProvider;
  /** Optional skill registry for available skills prompt injection */
  readonly skillRegistry?: SkillRegistry;
  /** Optional skill prompt adapter */
  readonly skillPromptAdapter?: SkillPromptAdapter;
  /** Optional metrics collector for observability */
  readonly metrics?: IMetricsCollector;
  /** Optional context manager for compaction scratchpad updates */
  readonly contextManager?: ContextManager;
  /** Optional context ID provider for compaction */
  readonly getContextId?: () => string | undefined;
  /** Optional context compression configuration */
  readonly contextCompression?: ContextCompressionConfig;
  /** Optional audit logger for compaction events */
  readonly auditLogger?: AuditLogger;
  /** Optional session ID provider for audit logging */
  readonly getSessionId?: () => string | undefined;
  /** Optional correlation ID provider for audit logging */
  readonly getCorrelationId?: () => string | undefined;
  /** Optional model ID provider for context window guard */
  readonly getModelId?: () => string | undefined;
  /** Optional model routing decision provider */
  readonly getModelDecision?: () => ModelRoutingDecision | undefined;
  /** Optional model router for health tracking */
  readonly modelRouter?: ModelRouter;
  /** Function to retrieve available tool definitions */
  readonly getToolDefinitions: () => AgentToolDefinition[];
}

/**
 * Configuration options for the TurnExecutor.
 */
export interface TurnExecutorConfig {
  /** Custom system prompt (defaults to AGENTS_GUIDE_PROMPT) */
  readonly systemPrompt?: string;
  /** Agent name for knowledge matching */
  readonly agentName?: string;
  /** LLM temperature (0.0 - 1.0, defaults to 0.7) */
  readonly temperature?: number;
  /** Maximum tokens for LLM response */
  readonly maxTokens?: number;
  /** Optional prompt formatting overrides for skills */
  readonly skillPrompt?: SkillPromptOptions;
}

/**
 * Interface for turn execution.
 * Allows for easy mocking in tests.
 */
export interface ITurnExecutor {
  /**
   * Execute a single agent turn.
   *
   * @param state - Current agent state including message history
   * @param span - Optional tracing span for observability
   * @returns Turn outcome with response, tool calls, or error
   */
  execute(state: AgentState, span?: SpanContext): Promise<TurnOutcome>;
}

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_TEMPERATURE = 0.7;
const DEFAULT_MAX_KNOWLEDGE_ITEMS = 5;
const DEFAULT_CONTEXT_COMPRESSION_THRESHOLD = 0.8;
const DEFAULT_CONTEXT_PRESERVE_COUNT = 3;
const DEFAULT_CONTEXT_COMPRESSION_STRATEGY = "hybrid";

/** Internal mutable version of TurnMetrics for accumulating during execution */
type MutableTurnMetrics = {
  -readonly [K in keyof TurnMetrics]: TurnMetrics[K];
};

type CompressionSettings = {
  maxTokens: number;
  threshold: number;
  budgetTokens?: number;
  preserveCount: number;
  strategy: "summarize" | "truncate" | "hybrid";
};

// ============================================================================
// Turn Executor Implementation
// ============================================================================

/**
 * Executes a single agent turn by coordinating:
 * 1. Message compression
 * 2. Knowledge matching
 * 3. LLM completion (with caching)
 * 4. Response processing
 */
export class TurnExecutor implements ITurnExecutor {
  private readonly deps: TurnExecutorDependencies;
  private readonly config: Required<Pick<TurnExecutorConfig, "temperature">> & TurnExecutorConfig;

  constructor(deps: TurnExecutorDependencies, config: TurnExecutorConfig = {}) {
    this.deps = deps;
    this.config = {
      temperature: DEFAULT_TEMPERATURE,
      ...config,
    };
  }

  async execute(state: AgentState, span?: SpanContext): Promise<TurnOutcome> {
    const turnStart = performance.now();
    const metrics: MutableTurnMetrics = {
      compressionRatio: 0,
      compressionTimeMs: 0,
      cacheHit: false,
      cacheTimeMs: 0,
      knowledgeMatched: 0,
      totalTimeMs: 0,
    };

    try {
      const modelDecision = this.deps.getModelDecision?.();
      const contextModelId = modelDecision?.resolved ?? this.deps.getModelId?.();

      // Step 1: Match relevant knowledge and symbol context
      const knowledgeContent = this.matchKnowledge(state, span);
      const symbolContext = this.matchSymbolContext(state, span);
      metrics.knowledgeMatched = knowledgeContent ? 1 : 0;

      // Step 2: Build LLM prompt context
      const contextFrame = this.buildContextFrame();
      const skillPrompt = this.buildSkillPrompt();
      const systemPrompt = this.buildSystemPrompt(
        knowledgeContent,
        symbolContext,
        skillPrompt,
        contextFrame?.content
      );

      // Step 3: Compress message history
      const compressionSettings = this.resolveCompressionSettings(contextModelId, span);
      const compressionResult = await this.compressMessages(
        state.messages,
        span,
        compressionSettings,
        systemPrompt
      );
      metrics.compressionRatio = compressionResult.ratio;
      metrics.compressionTimeMs = compressionResult.timeMs;

      // Step 4: Build LLM request
      const request = this.buildRequest(
        compressionResult.messages,
        systemPrompt,
        modelDecision?.resolved
      );

      // Step 5: Get LLM response (with caching)
      const { response, cacheHit, cacheTimeMs, modelId } = await this.getResponse(
        request,
        modelDecision,
        span
      );
      metrics.cacheHit = cacheHit;
      metrics.cacheTimeMs = cacheTimeMs;

      // Step 6: Build assistant message
      const assistantMessage = this.buildAssistantMessage(response);

      // Step 7: Determine outcome
      metrics.totalTimeMs = performance.now() - turnStart;

      const outcomeBase = {
        response,
        modelId,
        assistantMessage,
        metrics,
        compressedMessages: compressionResult.messages,
        usage: response.usage,
      };

      const toolCalls = response.toolCalls ?? [];
      if (toolCalls.length === 0) {
        const reason =
          response.finishReason === "stop"
            ? "Completion tool required for termination."
            : `Model returned ${response.finishReason} without tool calls.`;
        return this.buildErrorOutcome(new Error(reason), metrics);
      }

      return {
        type: "tool_use",
        ...outcomeBase,
        toolCalls,
      };
    } catch (err) {
      metrics.totalTimeMs = performance.now() - turnStart;
      return this.buildErrorOutcome(err, metrics);
    }
  }

  // ==========================================================================
  // Private Methods
  // ==========================================================================

  private async compressMessages(
    messages: AgentMessage[],
    span: SpanContext | undefined,
    settings: CompressionSettings,
    systemPrompt: string
  ): Promise<{ messages: AgentMessage[]; ratio: number; timeMs: number }> {
    const start = performance.now();
    const compactor = this.createContextCompactor(settings);
    const thresholdCheck = compactor.checkThreshold(
      this.toCompactorMessages(messages),
      systemPrompt
    );
    span?.setAttribute("compaction.threshold", settings.threshold);
    span?.setAttribute("compaction.tokens", thresholdCheck.currentTokens);
    span?.setAttribute("compaction.limit", thresholdCheck.maxTokens);

    const result = settings.budgetTokens
      ? await this.deps.messageCompressor.compressWithMaxTokensAsync(
          messages,
          settings.budgetTokens
        )
      : await this.deps.messageCompressor.compressAsync(messages);
    const timeMs = performance.now() - start;

    if (result.compressionRatio > 0) {
      this.deps.metrics?.observe(
        AGENT_METRICS.messageCompressionRatio.name,
        result.compressionRatio
      );
      this.deps.metrics?.observe(AGENT_METRICS.messageCompressionTime.name, timeMs);
      span?.setAttribute("compression.ratio", result.compressionRatio);
      span?.setAttribute("compression.removed", result.removedCount);
    }
    if (settings.budgetTokens) {
      span?.setAttribute("compression.max_tokens_override", settings.budgetTokens);
    }

    if (result.summarizedCount > 0 && result.metadata?.summary) {
      this.applyCompactionSummary({
        summary: result.metadata.summary,
        compactor,
        originalMessages: messages,
        compressedMessages: result.messages,
        span,
      });
    }

    return {
      messages: result.messages,
      ratio: result.compressionRatio,
      timeMs,
    };
  }

  private resolveCompressionSettings(
    modelId: string | undefined,
    span?: SpanContext
  ): CompressionSettings {
    const configuredMaxTokens =
      this.deps.contextCompression?.maxTokens ?? this.deps.messageCompressor.getMaxTokens();
    const threshold = this.normalizeCompressionThreshold(
      this.deps.contextCompression?.compressionThreshold ?? DEFAULT_CONTEXT_COMPRESSION_THRESHOLD
    );
    const preserveCount =
      this.deps.contextCompression?.preserveCount ?? DEFAULT_CONTEXT_PRESERVE_COUNT;
    const strategy = this.resolveCompactionStrategy(this.deps.contextCompression?.strategy);

    const modelContextWindow = this.resolveContextWindowLimit(modelId, span);
    const maxTokens = modelContextWindow
      ? Math.min(modelContextWindow, configuredMaxTokens)
      : configuredMaxTokens;
    const budgetTokens = Math.floor(maxTokens * threshold);

    span?.setAttribute("context.window.budget", budgetTokens);

    return {
      maxTokens,
      threshold,
      budgetTokens: budgetTokens > 0 && budgetTokens < maxTokens ? budgetTokens : undefined,
      preserveCount,
      strategy,
    };
  }

  private resolveContextWindowLimit(
    modelId: string | undefined,
    span?: SpanContext
  ): number | undefined {
    if (!modelId) {
      return undefined;
    }

    const capability = getModelCapabilityCache().get(modelId);
    if (!capability?.contextWindow) {
      return undefined;
    }

    span?.setAttribute("context.window", capability.contextWindow);
    return capability.contextWindow;
  }

  private normalizeCompressionThreshold(value: number): number {
    if (!Number.isFinite(value)) {
      return DEFAULT_CONTEXT_COMPRESSION_THRESHOLD;
    }
    if (value <= 0) {
      return DEFAULT_CONTEXT_COMPRESSION_THRESHOLD;
    }
    if (value > 1) {
      return 1;
    }
    return value;
  }

  private resolveCompactionStrategy(
    strategy: ContextCompressionConfig["strategy"] | undefined
  ): CompressionSettings["strategy"] {
    if (strategy === "summarize" || strategy === "truncate" || strategy === "hybrid") {
      return strategy;
    }
    if (strategy === "sliding_window") {
      return "truncate";
    }
    return DEFAULT_CONTEXT_COMPRESSION_STRATEGY;
  }

  private createContextCompactor(settings: CompressionSettings): ContextCompactor {
    return createContextCompactor({
      contextConfig: {
        maxTokens: settings.maxTokens,
        compressionThreshold: settings.threshold,
        preserveLastN: settings.preserveCount,
        compressionStrategy: settings.strategy,
      },
    });
  }

  private applyCompactionSummary(input: {
    summary: string;
    compactor: ContextCompactor;
    originalMessages: AgentMessage[];
    compressedMessages: AgentMessage[];
    span?: SpanContext;
  }): void {
    const contextManager = this.deps.contextManager;
    const contextId = this.deps.getContextId?.();
    if (!contextManager || !contextId) {
      return;
    }

    const result = input.compactor.applyCompaction(
      contextManager,
      contextId,
      input.summary,
      this.toCompactorMessages(input.compressedMessages),
      this.toCompactorMessages(input.originalMessages)
    );

    if (result.metrics) {
      this.deps.metrics?.increment(
        AGENT_METRICS.contextCompactionTokensSaved.name,
        undefined,
        result.metrics.tokensSaved
      );
      this.deps.metrics?.observe(
        AGENT_METRICS.contextCompactionRatio.name,
        result.metrics.compressionRatio
      );
      this.deps.metrics?.observe(
        AGENT_METRICS.contextCompactionTime.name,
        result.metrics.compressionTimeMs
      );
      input.span?.setAttribute("compaction.tokens_saved", result.metrics.tokensSaved);
      input.span?.setAttribute("compaction.ratio", result.metrics.compressionRatio);
      input.span?.setAttribute("compaction.time_ms", result.metrics.compressionTimeMs);
    }

    contextManager.updateMetadata(contextId, {
      lastCompaction: {
        at: new Date().toISOString(),
        summaryLength: input.summary.length,
        messagesBefore: result.messagesBefore,
        messagesAfter: result.messagesAfter,
        tokensSaved: result.metrics?.tokensSaved,
      },
    });

    this.deps.auditLogger?.log({
      timestamp: Date.now(),
      toolName: "context:compaction",
      action: "result",
      sessionId: this.deps.getSessionId?.(),
      correlationId: this.deps.getCorrelationId?.(),
      input: {
        messagesBefore: result.messagesBefore,
        messagesAfter: result.messagesAfter,
        summaryLength: input.summary.length,
      },
      output: result.metrics ?? undefined,
      sandboxed: false,
    });
  }

  private toCompactorMessages(messages: AgentMessage[]): ContextMessage[] {
    const converted: ContextMessage[] = [];
    let toolIndex = 0;

    for (const message of messages) {
      if (message.role === "tool") {
        const callId = `${message.toolName ?? "tool"}-${toolIndex}`;
        toolIndex += 1;
        const toolResult: ContextToolResult = {
          callId,
          result: message.result,
          size: undefined,
        };
        converted.push({
          role: "assistant",
          content: "",
          toolResults: [toolResult],
        });
        continue;
      }

      if (message.role === "assistant") {
        const toolCalls: ContextToolCall[] | undefined = message.toolCalls?.map((call, index) => ({
          id: call.id ?? `call-${index}`,
          name: call.name,
          arguments: call.arguments,
        }));
        converted.push({
          role: "assistant",
          content: message.content,
          toolCalls,
        });
        continue;
      }

      converted.push({
        role: message.role,
        content: message.content,
      });
    }

    return converted;
  }

  private matchKnowledge(state: AgentState, span?: SpanContext): string | undefined {
    if (!this.deps.knowledgeRegistry) {
      return undefined;
    }

    const latestUserMessage = this.getLatestUserMessage(state);
    if (!latestUserMessage) {
      return undefined;
    }

    const result: KnowledgeMatchResult | undefined = this.deps.knowledgeRegistry.match({
      query: latestUserMessage,
      agentType: this.config.agentName,
      maxItems: DEFAULT_MAX_KNOWLEDGE_ITEMS,
    });

    if (result?.items.length) {
      span?.setAttribute("knowledge.matched", result.items.length);
      return result.formattedContent;
    }

    return undefined;
  }

  private matchSymbolContext(state: AgentState, span?: SpanContext): string | undefined {
    if (!this.deps.symbolContextProvider) {
      return undefined;
    }

    const latestUserMessage = this.getLatestUserMessage(state);
    if (!latestUserMessage) {
      return undefined;
    }

    const context = this.deps.symbolContextProvider.getSymbolContext(latestUserMessage);
    if (context) {
      span?.setAttribute("symbol.context_length", context.length);
      return context;
    }

    return undefined;
  }

  private buildContextFrame(): ContextFrameOutput | undefined {
    if (!this.deps.contextFrameBuilder || !this.deps.getContextItems) {
      return undefined;
    }
    try {
      const items = this.deps.getContextItems();
      if (items.length === 0) {
        return undefined;
      }
      return this.deps.contextFrameBuilder.build(items);
    } catch {
      return undefined;
    }
  }

  private buildSystemPrompt(
    knowledgeContent?: string,
    symbolContext?: string,
    skillPrompt?: string,
    contextFrameContent?: string
  ): string {
    const basePrompt = this.config.systemPrompt ?? AGENTS_GUIDE_PROMPT;
    const promptParts = [basePrompt];
    if (skillPrompt) {
      promptParts.push(skillPrompt);
    }
    if (contextFrameContent) {
      promptParts.push(`## Context Frame\n\n${contextFrameContent}`);
    }
    if (symbolContext) {
      promptParts.push(`## Code Perception\n\n${symbolContext}`);
    }
    if (knowledgeContent) {
      promptParts.push(`## Relevant Knowledge\n\n${knowledgeContent}`);
    }
    return promptParts.join("\n\n");
  }

  private buildRequest(
    messages: AgentMessage[],
    systemPrompt: string,
    modelId?: string
  ): AgentLLMRequest {
    return {
      messages,
      tools: this.deps.getToolDefinitions(),
      systemPrompt,
      temperature: this.config.temperature,
      maxTokens: this.config.maxTokens,
      model: modelId,
    };
  }

  private async getResponse(
    request: AgentLLMRequest,
    modelDecision: ModelRoutingDecision | undefined,
    span?: SpanContext
  ): Promise<{
    response: AgentLLMResponse;
    cacheHit: boolean;
    cacheTimeMs: number;
    modelId?: string;
  }> {
    const start = performance.now();
    const attempts = this.buildAttemptRequests(request, modelDecision);
    let lastError: unknown;

    for (let index = 0; index < attempts.length; index += 1) {
      const attempt = attempts[index];
      const cached = this.getCachedAttempt(attempt, index, start, span);
      if (cached) {
        return cached;
      }

      const outcome = await this.executeAttempt(attempt, index, start, span);
      if (outcome.result) {
        return outcome.result;
      }
      lastError = outcome.error;
    }

    throw lastError ?? new Error("LLM request failed");
  }

  private buildAttemptRequests(
    request: AgentLLMRequest,
    modelDecision: ModelRoutingDecision | undefined
  ): Array<{ modelId?: string; request: AgentLLMRequest }> {
    const primaryModel = request.model;
    const fallbackModels = modelDecision?.fallbackModels ?? [];
    const candidates = primaryModel
      ? [primaryModel, ...fallbackModels.filter((model) => model !== primaryModel)]
      : [];

    if (candidates.length === 0) {
      return [{ modelId: request.model, request }];
    }

    return candidates.map((modelId) => ({
      modelId,
      request: { ...request, model: modelId },
    }));
  }

  private getCachedAttempt(
    attempt: { modelId?: string; request: AgentLLMRequest },
    index: number,
    start: number,
    span?: SpanContext
  ): {
    response: AgentLLMResponse;
    cacheHit: boolean;
    cacheTimeMs: number;
    modelId?: string;
  } | null {
    const cached = this.deps.requestCache.get(attempt.request);
    if (!cached) {
      return null;
    }

    this.deps.metrics?.increment(AGENT_METRICS.requestCacheHits.name);
    span?.setAttribute("cache.hit", true);
    if (index > 0) {
      span?.setAttribute("model.fallback", true);
    }

    return {
      response: cached,
      cacheHit: true,
      cacheTimeMs: performance.now() - start,
      modelId: attempt.modelId,
    };
  }

  private async executeAttempt(
    attempt: { modelId?: string; request: AgentLLMRequest },
    index: number,
    start: number,
    span?: SpanContext
  ): Promise<{
    result?: {
      response: AgentLLMResponse;
      cacheHit: boolean;
      cacheTimeMs: number;
      modelId?: string;
    };
    error?: unknown;
  }> {
    const attemptStart = performance.now();
    try {
      const response = await this.deps.llm.complete(attempt.request);
      const latencyMs = performance.now() - attemptStart;

      this.deps.requestCache.set(attempt.request, response);
      this.deps.metrics?.increment(AGENT_METRICS.requestCacheMisses.name);
      span?.setAttribute("cache.hit", false);

      if (attempt.modelId) {
        this.deps.modelRouter?.recordLatency(attempt.modelId, latencyMs);
      }
      if (index > 0) {
        span?.setAttribute("model.fallback", true);
      }

      const cacheTimeMs = performance.now() - start;
      this.deps.metrics?.observe(AGENT_METRICS.requestCacheTime.name, cacheTimeMs);

      return {
        result: {
          response,
          cacheHit: false,
          cacheTimeMs,
          modelId: attempt.modelId,
        },
      };
    } catch (error) {
      const latencyMs = performance.now() - attemptStart;
      if (attempt.modelId) {
        this.deps.modelRouter?.recordError(attempt.modelId, latencyMs);
      }
      return { error };
    }
  }

  private buildAssistantMessage(response: AgentLLMResponse): AgentMessage {
    return {
      role: "assistant",
      content: response.content,
      toolCalls: response.toolCalls,
    };
  }

  private buildErrorOutcome(err: unknown, metrics: TurnMetrics): TurnOutcome {
    const errorMessage = err instanceof Error ? err.message : String(err);
    return {
      type: "error",
      error: errorMessage,
      metrics,
    };
  }

  private getLatestUserMessage(state: AgentState): string | undefined {
    for (let i = state.messages.length - 1; i >= 0; i--) {
      const message = state.messages[i];
      if (message.role === "user") {
        return message.content;
      }
    }
    return undefined;
  }

  private buildSkillPrompt(): string | undefined {
    if (!this.deps.skillRegistry) {
      return undefined;
    }

    const adapter = this.deps.skillPromptAdapter ?? new SkillPromptAdapter();
    const skills = this.deps.skillRegistry.list();
    if (skills.length === 0) {
      return undefined;
    }

    return adapter.formatAvailableSkills(skills, this.config.skillPrompt);
  }
}

// ============================================================================
// Factory
// ============================================================================

/**
 * Create a new TurnExecutor instance.
 *
 * @param deps - Required dependencies
 * @param config - Optional configuration
 * @returns ITurnExecutor instance
 */
export function createTurnExecutor(
  deps: TurnExecutorDependencies,
  config?: TurnExecutorConfig
): ITurnExecutor {
  return new TurnExecutor(deps, config);
}
