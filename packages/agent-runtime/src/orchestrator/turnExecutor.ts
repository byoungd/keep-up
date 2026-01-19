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
import type { ContextFrameBuilder, ContextFrameOutput, ContextItem } from "../context";
import type { KnowledgeMatchResult, KnowledgeRegistry } from "../knowledge";
import { AGENTS_GUIDE_PROMPT } from "../prompts/agentGuidelines";
import { SkillPromptAdapter, type SkillPromptOptions } from "../skills/skillPromptAdapter";
import type { SkillRegistry } from "../skills/skillRegistry";
import type { AgentMessage, AgentState, MCPToolCall, TokenUsageStats } from "../types";
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
  /** Optional skill registry for available skills prompt injection */
  readonly skillRegistry?: SkillRegistry;
  /** Optional skill prompt adapter */
  readonly skillPromptAdapter?: SkillPromptAdapter;
  /** Optional metrics collector for observability */
  readonly metrics?: IMetricsCollector;
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

/** Internal mutable version of TurnMetrics for accumulating during execution */
type MutableTurnMetrics = {
  -readonly [K in keyof TurnMetrics]: TurnMetrics[K];
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
      // Step 1: Compress message history
      const compressionResult = this.compressMessages(state.messages, span);
      metrics.compressionRatio = compressionResult.ratio;
      metrics.compressionTimeMs = compressionResult.timeMs;

      // Step 2: Match relevant knowledge
      const knowledgeContent = this.matchKnowledge(state, span);
      metrics.knowledgeMatched = knowledgeContent ? 1 : 0;

      // Step 3: Build LLM request
      const contextFrame = this.buildContextFrame();
      const skillPrompt = this.buildSkillPrompt();
      const request = this.buildRequest(
        compressionResult.messages,
        knowledgeContent,
        skillPrompt,
        contextFrame?.content
      );

      // Step 4: Get LLM response (with caching)
      const { response, cacheHit, cacheTimeMs } = await this.getResponse(request, span);
      metrics.cacheHit = cacheHit;
      metrics.cacheTimeMs = cacheTimeMs;

      // Step 5: Build assistant message
      const assistantMessage = this.buildAssistantMessage(response);

      // Step 6: Determine outcome
      metrics.totalTimeMs = performance.now() - turnStart;

      const outcomeBase = {
        response,
        assistantMessage,
        metrics,
        compressedMessages: compressionResult.messages,
        usage: response.usage,
      };

      if (this.isComplete(response)) {
        return {
          type: "complete",
          ...outcomeBase,
        };
      }

      return {
        type: "tool_use",
        ...outcomeBase,
        toolCalls: response.toolCalls,
      };
    } catch (err) {
      metrics.totalTimeMs = performance.now() - turnStart;
      return this.buildErrorOutcome(err, metrics);
    }
  }

  // ==========================================================================
  // Private Methods
  // ==========================================================================

  private compressMessages(
    messages: AgentMessage[],
    span?: SpanContext
  ): { messages: AgentMessage[]; ratio: number; timeMs: number } {
    const start = performance.now();
    const result = this.deps.messageCompressor.compress(messages);
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

    return {
      messages: result.messages,
      ratio: result.compressionRatio,
      timeMs,
    };
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

  private buildRequest(
    messages: AgentMessage[],
    knowledgeContent?: string,
    skillPrompt?: string,
    contextFrameContent?: string
  ): AgentLLMRequest {
    const basePrompt = this.config.systemPrompt ?? AGENTS_GUIDE_PROMPT;
    const promptParts = [basePrompt];
    if (skillPrompt) {
      promptParts.push(skillPrompt);
    }
    if (contextFrameContent) {
      promptParts.push(`## Context Frame\n\n${contextFrameContent}`);
    }
    if (knowledgeContent) {
      promptParts.push(`## Relevant Knowledge\n\n${knowledgeContent}`);
    }
    const systemPrompt = promptParts.join("\n\n");

    return {
      messages,
      tools: this.deps.getToolDefinitions(),
      systemPrompt,
      temperature: this.config.temperature,
      maxTokens: this.config.maxTokens,
    };
  }

  private async getResponse(
    request: AgentLLMRequest,
    span?: SpanContext
  ): Promise<{ response: AgentLLMResponse; cacheHit: boolean; cacheTimeMs: number }> {
    const start = performance.now();
    const cached = this.deps.requestCache.get(request);

    if (cached) {
      this.deps.metrics?.increment(AGENT_METRICS.requestCacheHits.name);
      span?.setAttribute("cache.hit", true);
      return {
        response: cached,
        cacheHit: true,
        cacheTimeMs: performance.now() - start,
      };
    }

    const response = await this.deps.llm.complete(request);
    this.deps.requestCache.set(request, response);
    this.deps.metrics?.increment(AGENT_METRICS.requestCacheMisses.name);
    span?.setAttribute("cache.hit", false);

    const cacheTimeMs = performance.now() - start;
    this.deps.metrics?.observe(AGENT_METRICS.requestCacheTime.name, cacheTimeMs);

    return { response, cacheHit: false, cacheTimeMs };
  }

  private buildAssistantMessage(response: AgentLLMResponse): AgentMessage {
    return {
      role: "assistant",
      content: response.content,
      toolCalls: response.toolCalls,
    };
  }

  private isComplete(response: AgentLLMResponse): boolean {
    // If tool calls are present, it is not complete regardless of finishReason
    if (response.toolCalls && response.toolCalls.length > 0) {
      return false;
    }
    // Otherwise rely on finish reason "stop"
    return response.finishReason === "stop";
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
