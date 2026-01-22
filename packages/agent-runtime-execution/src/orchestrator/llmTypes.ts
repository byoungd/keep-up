/**
 * LLM Interface Types
 *
 * Shared types for LLM adapters and orchestrator tooling.
 */

import type { AgentMessage, MCPToolCall, TokenUsageStats } from "../types";

/**
 * Interface for LLM completion.
 * Implement this to connect to your LLM provider.
 */
export interface IAgentLLM {
  /** Generate a completion with tool use support */
  complete(request: AgentLLMRequest): Promise<AgentLLMResponse>;

  /** Stream a completion (optional) */
  stream?(request: AgentLLMRequest): AsyncIterable<AgentLLMChunk>;
}

export interface AgentLLMRequest {
  messages: AgentMessage[];
  tools: AgentToolDefinition[];
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
}

export interface AgentToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface AgentLLMResponse {
  content: string;
  toolCalls?: MCPToolCall[];
  finishReason: "stop" | "tool_use" | "max_tokens" | "error";
  usage?: TokenUsageStats;
}

export interface AgentLLMChunk {
  type: "content" | "tool_call" | "done" | "usage";
  content?: string;
  toolCall?: MCPToolCall;
  usage?: TokenUsageStats;
}
