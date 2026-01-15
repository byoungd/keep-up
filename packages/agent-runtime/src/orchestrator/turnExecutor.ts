/**
 * Turn Executor
 *
 * Encapsulates the logic for executing a single agent turn.
 * Extracts the core LLM interaction and tool execution from the orchestrator.
 */

import type { KnowledgeMatchResult, KnowledgeRegistry } from "../knowledge";
import { AGENTS_GUIDE_PROMPT } from "../prompts/agentGuidelines";
import { AGENT_METRICS } from "../telemetry";
import type { IMetricsCollector, SpanContext } from "../telemetry";
import type { AgentMessage, AgentState, MCPToolCall } from "../types";
import type { MessageCompressor } from "./messageCompression";
import type {
  AgentLLMRequest,
  AgentLLMResponse,
  AgentToolDefinition,
  IAgentLLM,
} from "./orchestrator";
import type { RequestCache } from "./requestCache";

// ============================================================================
// Types
// ============================================================================

export type TurnOutcomeType = "complete" | "tool_use" | "error";

export interface TurnOutcome {
  type: TurnOutcomeType;
  response?: AgentLLMResponse;
  assistantMessage?: AgentMessage;
  toolCalls?: MCPToolCall[];
  error?: string;
  metrics?: TurnMetrics;
}

export interface TurnMetrics {
  compressionRatio: number;
  compressionTimeMs: number;
  cacheHit: boolean;
  cacheTimeMs: number;
  knowledgeMatched: number;
}

export interface TurnExecutorDependencies {
  llm: IAgentLLM;
  messageCompressor: MessageCompressor;
  requestCache: RequestCache;
  knowledgeRegistry?: KnowledgeRegistry;
  metrics?: IMetricsCollector;
  getToolDefinitions: () => AgentToolDefinition[];
}

export interface TurnExecutorConfig {
  systemPrompt?: string;
  agentName?: string;
}

export interface ITurnExecutor {
  execute(state: AgentState, span?: SpanContext): Promise<TurnOutcome>;
}

// ============================================================================
// Turn Executor Implementation
// ============================================================================

export class TurnExecutor implements ITurnExecutor {
  private readonly deps: TurnExecutorDependencies;
  private readonly config: TurnExecutorConfig;

  constructor(deps: TurnExecutorDependencies, config: TurnExecutorConfig = {}) {
    this.deps = deps;
    this.config = config;
  }

  async execute(state: AgentState, span?: SpanContext): Promise<TurnOutcome> {
    const metrics: TurnMetrics = {
      compressionRatio: 0,
      compressionTimeMs: 0,
      cacheHit: false,
      cacheTimeMs: 0,
      knowledgeMatched: 0,
    };

    try {
      // Step 1: Compress message history
      const compressionStart = performance.now();
      const compressedResult = this.deps.messageCompressor.compress(state.messages);
      const messagesToUse = compressedResult.messages;

      metrics.compressionRatio = compressedResult.compressionRatio;
      metrics.compressionTimeMs = performance.now() - compressionStart;

      if (metrics.compressionRatio > 0) {
        this.deps.metrics?.observe(
          AGENT_METRICS.messageCompressionRatio.name,
          metrics.compressionRatio
        );
        this.deps.metrics?.observe(
          AGENT_METRICS.messageCompressionTime.name,
          metrics.compressionTimeMs
        );
        span?.setAttribute("compression.ratio", metrics.compressionRatio);
        span?.setAttribute("compression.removed", compressedResult.removedCount);
      }

      // Step 2: Match relevant knowledge
      const knowledgeContent = this.matchKnowledge(state, span);
      if (knowledgeContent) {
        metrics.knowledgeMatched = 1;
      }

      // Step 3: Build system prompt
      const systemPrompt = this.buildSystemPrompt(knowledgeContent);

      // Step 4: Prepare LLM request
      const tools = this.deps.getToolDefinitions();
      const request: AgentLLMRequest = {
        messages: messagesToUse,
        tools,
        systemPrompt,
        temperature: 0.7,
      };

      // Step 5: Check cache and get response
      const cacheStart = performance.now();
      const cached = this.deps.requestCache.get(request);
      let response: AgentLLMResponse;

      if (cached) {
        response = cached;
        metrics.cacheHit = true;
        this.deps.metrics?.increment(AGENT_METRICS.requestCacheHits.name);
        span?.setAttribute("cache.hit", true);
      } else {
        response = await this.deps.llm.complete(request);
        this.deps.requestCache.set(request, response);
        this.deps.metrics?.increment(AGENT_METRICS.requestCacheMisses.name);
        span?.setAttribute("cache.hit", false);
      }

      metrics.cacheTimeMs = performance.now() - cacheStart;
      this.deps.metrics?.observe(AGENT_METRICS.requestCacheTime.name, metrics.cacheTimeMs);

      // Step 6: Create assistant message
      const assistantMessage: AgentMessage = {
        role: "assistant",
        content: response.content,
        toolCalls: response.toolCalls,
      };

      // Determine outcome type
      if (response.finishReason === "stop" || !response.toolCalls?.length) {
        return {
          type: "complete",
          response,
          assistantMessage,
          metrics,
        };
      }

      return {
        type: "tool_use",
        response,
        assistantMessage,
        toolCalls: response.toolCalls,
        metrics,
      };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      return {
        type: "error",
        error: errorMessage,
        metrics,
      };
    }
  }

  private matchKnowledge(state: AgentState, span?: SpanContext): string | undefined {
    if (!this.deps.knowledgeRegistry) {
      return undefined;
    }

    const latestUserMessage = this.getLatestUserMessage(state);
    if (!latestUserMessage) {
      return undefined;
    }

    const knowledgeResult: KnowledgeMatchResult | undefined = this.deps.knowledgeRegistry.match({
      query: latestUserMessage,
      agentType: this.config.agentName,
      maxItems: 5,
    });

    if (knowledgeResult && knowledgeResult.items.length > 0) {
      span?.setAttribute("knowledge.matched", knowledgeResult.items.length);
      return knowledgeResult.formattedContent;
    }

    return undefined;
  }

  private buildSystemPrompt(knowledgeContent?: string): string {
    const baseSystemPrompt = this.config.systemPrompt ?? AGENTS_GUIDE_PROMPT;
    if (knowledgeContent) {
      return `${baseSystemPrompt}\n\n## Relevant Knowledge\n\n${knowledgeContent}`;
    }
    return baseSystemPrompt;
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
}

// ============================================================================
// Factory
// ============================================================================

export function createTurnExecutor(
  deps: TurnExecutorDependencies,
  config?: TurnExecutorConfig
): ITurnExecutor {
  return new TurnExecutor(deps, config);
}
