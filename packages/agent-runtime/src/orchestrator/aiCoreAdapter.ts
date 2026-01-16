/**
 * AI-Core Provider Adapter
 *
 * Bridges @ku0/ai-core providers to the Agent runtime's IAgentLLM interface.
 * This maintains loose coupling while enabling integration with existing infrastructure.
 */

import type {
  AgentLLMChunk,
  AgentLLMRequest,
  AgentLLMResponse,
  AgentToolDefinition,
  IAgentLLM,
} from "../orchestrator/orchestrator";
import type { AgentMessage, MCPToolCall } from "../types";

// ============================================================================
// AI-Core Provider Interface (from @ku0/ai-core)
// ============================================================================

/**
 * Minimal interface matching @ku0/ai-core LLMProvider.
 * We define it here to avoid hard dependency on ai-core.
 */
export interface AICoreProvider {
  name: string;
  complete(request: AICoreCompletionRequest): Promise<AICoreCompletionResponse>;
  stream(request: AICoreCompletionRequest): AsyncIterable<AICoreStreamChunk>;
}

export interface AICoreCompletionRequest {
  model?: string;
  messages: Array<{ role: string; content: string }>;
  temperature?: number;
  maxTokens?: number;
  tools?: AICoreToolDefinition[];
}

export interface AICoreToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface AICoreCompletionResponse {
  content: string;
  toolCalls?: Array<{
    id: string;
    name: string;
    arguments: Record<string, unknown>;
  }>;
  usage?: {
    inputTokens: number;
    outputTokens: number;
  };
  finishReason?: string;
}

export interface AICoreStreamChunk {
  type: "content" | "tool_call" | "done" | "error";
  content?: string;
  toolCall?: {
    id: string;
    name: string;
    arguments: Record<string, unknown>;
  };
  error?: string;
}

// ============================================================================
// Provider Adapter
// ============================================================================

export interface AICoreAdapterOptions {
  /** Model to use */
  model?: string;
  /** Default temperature */
  temperature?: number;
  /** Default max tokens */
  maxTokens?: number;
}

/**
 * Adapts an @ku0/ai-core provider to the IAgentLLM interface.
 */
export class AICoreProviderAdapter implements IAgentLLM {
  private readonly provider: AICoreProvider;
  private readonly options: AICoreAdapterOptions;
  private toolNameMap: {
    originalToSanitized: Map<string, string>;
    sanitizedToOriginal: Map<string, string>;
  } | null = null;

  constructor(provider: AICoreProvider, options: AICoreAdapterOptions = {}) {
    this.provider = provider;
    this.options = options;
  }

  async complete(request: AgentLLMRequest): Promise<AgentLLMResponse> {
    const aiCoreRequest = this.convertRequest(request);
    const response = await this.provider.complete(aiCoreRequest);
    return this.convertResponse(response);
  }

  async *stream(request: AgentLLMRequest): AsyncIterable<AgentLLMChunk> {
    const aiCoreRequest = this.convertRequest(request);

    for await (const chunk of this.provider.stream(aiCoreRequest)) {
      yield this.convertChunk(chunk);
    }
  }

  private convertRequest(request: AgentLLMRequest): AICoreCompletionRequest {
    // Convert agent messages to ai-core format
    const messages = request.messages.map((msg) => this.convertMessage(msg));

    // Convert tools to ai-core format
    const toolNameMap = this.buildToolNameMap(request.tools ?? []);
    const tools = request.tools?.map((tool) => this.convertTool(tool, toolNameMap));
    this.toolNameMap = toolNameMap;

    return {
      model: this.options.model,
      messages,
      temperature: request.temperature ?? this.options.temperature ?? 0.7,
      maxTokens: request.maxTokens ?? this.options.maxTokens,
      tools,
    };
  }

  private convertMessage(msg: AgentMessage): { role: string; content: string } {
    switch (msg.role) {
      case "system":
        return { role: "system", content: msg.content };
      case "user":
        return { role: "user", content: msg.content };
      case "assistant": {
        // Include tool calls in content if present
        let content = msg.content;
        if (msg.toolCalls && msg.toolCalls.length > 0) {
          const toolCallsStr = msg.toolCalls
            .map((tc) => `[Tool: ${tc.name}(${JSON.stringify(tc.arguments)})]`)
            .join("\n");
          content = content ? `${content}\n${toolCallsStr}` : toolCallsStr;
        }
        return { role: "assistant", content };
      }
      case "tool": {
        // Format tool result as user message (common pattern)
        const resultContent = msg.result.success
          ? msg.result.content.map((c) => (c.type === "text" ? c.text : `[${c.type}]`)).join("\n")
          : `Error: ${msg.result.error?.message ?? "Unknown error"}`;
        return {
          role: "user",
          content: `[Tool Result: ${msg.toolName}]\n${resultContent}`,
        };
      }
      default:
        return { role: "user", content: "" };
    }
  }

  private convertResponse(response: AICoreCompletionResponse): AgentLLMResponse {
    const toolCalls: MCPToolCall[] | undefined = response.toolCalls?.map((tc) => ({
      name: this.mapToolNameToOriginal(tc.name),
      arguments: tc.arguments,
    }));

    let finishReason: AgentLLMResponse["finishReason"] = "stop";
    if (response.finishReason === "tool_use" || (toolCalls && toolCalls.length > 0)) {
      finishReason = "tool_use";
    } else if (response.finishReason === "max_tokens" || response.finishReason === "length") {
      finishReason = "max_tokens";
    }

    return {
      content: response.content,
      toolCalls,
      finishReason,
    };
  }

  private convertChunk(chunk: AICoreStreamChunk): AgentLLMChunk {
    if (chunk.type === "content") {
      return { type: "content", content: chunk.content };
    }
    if (chunk.type === "tool_call" && chunk.toolCall) {
      return {
        type: "tool_call",
        toolCall: {
          name: this.mapToolNameToOriginal(chunk.toolCall.name),
          arguments: chunk.toolCall.arguments,
        },
      };
    }
    return { type: "done" };
  }

  private convertTool(
    tool: AgentToolDefinition,
    toolNameMap: {
      originalToSanitized: Map<string, string>;
      sanitizedToOriginal: Map<string, string>;
    }
  ): AICoreToolDefinition {
    return {
      name: toolNameMap.originalToSanitized.get(tool.name) ?? tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
    };
  }

  private buildToolNameMap(tools: AgentToolDefinition[]): {
    originalToSanitized: Map<string, string>;
    sanitizedToOriginal: Map<string, string>;
  } {
    const originalToSanitized = new Map<string, string>();
    const sanitizedToOriginal = new Map<string, string>();
    const used = new Set<string>();

    for (const tool of tools) {
      const base = sanitizeToolName(tool.name);
      let candidate = base;
      let index = 1;
      while (used.has(candidate)) {
        candidate = `${base}_${index}`;
        index += 1;
      }
      used.add(candidate);
      originalToSanitized.set(tool.name, candidate);
      sanitizedToOriginal.set(candidate, tool.name);
    }

    return { originalToSanitized, sanitizedToOriginal };
  }

  private mapToolNameToOriginal(name: string): string {
    return this.toolNameMap?.sanitizedToOriginal.get(name) ?? name;
  }
}

function sanitizeToolName(name: string): string {
  const sanitized = name.replace(/[^a-zA-Z0-9_-]/g, "_");
  if (!sanitized) {
    return "tool";
  }
  return sanitized.slice(0, 128);
}

// ============================================================================
// Mock LLM for Testing
// ============================================================================

/**
 * Simple mock LLM for testing the agent runtime.
 * Returns predefined responses based on message patterns.
 */
export class MockAgentLLM implements IAgentLLM {
  private responses: Map<string, AgentLLMResponse> = new Map();
  private defaultResponse: AgentLLMResponse = {
    content: "I understand. How can I help you?",
    finishReason: "stop",
  };

  /** Add a mock response for a message pattern */
  addResponse(pattern: string, response: AgentLLMResponse): void {
    this.responses.set(pattern.toLowerCase(), response);
  }

  /** Set the default response */
  setDefaultResponse(response: AgentLLMResponse): void {
    this.defaultResponse = response;
  }

  async complete(request: AgentLLMRequest): Promise<AgentLLMResponse> {
    // Find the last user message
    const lastUserMessage = [...request.messages].reverse().find((m) => m.role === "user");

    if (!lastUserMessage || lastUserMessage.role !== "user") {
      return this.defaultResponse;
    }

    const content = lastUserMessage.content.toLowerCase();

    // Check for matching patterns
    for (const [pattern, response] of this.responses) {
      if (content.includes(pattern)) {
        return response;
      }
    }

    return this.defaultResponse;
  }

  async *stream(request: AgentLLMRequest): AsyncIterable<AgentLLMChunk> {
    const response = await this.complete(request);

    // Stream content character by character (for testing)
    if (response.content) {
      for (const char of response.content) {
        yield { type: "content", content: char };
      }
    }

    // Yield tool calls
    if (response.toolCalls) {
      for (const toolCall of response.toolCalls) {
        yield { type: "tool_call", toolCall };
      }
    }

    yield { type: "done" };
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create an adapter for an @ku0/ai-core provider.
 */
export function createAICoreAdapter(
  provider: AICoreProvider,
  options?: AICoreAdapterOptions
): AICoreProviderAdapter {
  return new AICoreProviderAdapter(provider, options);
}

/**
 * Create a mock LLM for testing.
 */
export function createMockLLM(): MockAgentLLM {
  return new MockAgentLLM();
}
