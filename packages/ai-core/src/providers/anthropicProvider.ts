/**
 * Anthropic Provider
 *
 * LLM provider implementation for Anthropic API (Claude models).
 * Supports completions, streaming, and message-based conversations.
 */

import { BaseLLMProvider } from "./baseProvider";
import type {
  CompletionRequest,
  CompletionResponse,
  EmbeddingRequest,
  EmbeddingResponse,
  Message,
  ProviderConfig,
  StreamChunk,
  TokenUsage,
} from "./types";

export interface AnthropicConfig extends ProviderConfig {
  /** Anthropic API version header */
  apiVersion?: string;
}

interface AnthropicMessage {
  role: "user" | "assistant";
  content: string;
}

interface AnthropicCompletionResponse {
  id: string;
  type: "message";
  role: "assistant";
  model: string;
  content: Array<
    { type: "text"; text: string } | { type: "tool_use"; id: string; name: string; input: unknown }
  >;
  stop_reason: "end_turn" | "max_tokens" | "stop_sequence" | "tool_use" | null;
  stop_sequence: string | null;
  usage: { input_tokens: number; output_tokens: number };
}

interface AnthropicStreamEvent {
  type: string;
  index?: number;
  delta?: { type: string; text?: string; partial_json?: string };
  content_block?: { type: string; text?: string };
  message?: AnthropicCompletionResponse;
  usage?: { input_tokens?: number; output_tokens?: number };
}

const ANTHROPIC_MODELS = [
  "claude-opus-4-20250514",
  "claude-sonnet-4-20250514",
  "claude-3-5-sonnet-20241022",
  "claude-3-5-haiku-20241022",
  "claude-3-opus-20240229",
  "claude-3-sonnet-20240229",
  "claude-3-haiku-20240307",
] as const;

const DEFAULT_API_VERSION = "2023-06-01";

export class AnthropicProvider extends BaseLLMProvider {
  readonly name = "anthropic";
  readonly models = [...ANTHROPIC_MODELS];
  readonly defaultModel = "claude-sonnet-4-20250514";

  private readonly baseUrl: string;
  private readonly apiVersion: string;

  constructor(config: AnthropicConfig) {
    super(config);
    this.baseUrl = config.baseUrl || "https://api.anthropic.com/v1";
    this.apiVersion = config.apiVersion || DEFAULT_API_VERSION;
  }

  async complete(request: CompletionRequest): Promise<CompletionResponse> {
    const start = performance.now();

    try {
      const model = this.getModel(request.model);
      const { systemPrompt, messages } = this.formatMessages(request.messages);

      const body: Record<string, unknown> = {
        model,
        messages,
        max_tokens: request.maxTokens || 4096,
        temperature: request.temperature,
        top_p: request.topP,
        stop_sequences: request.stopSequences,
      };

      if (systemPrompt) {
        body.system = systemPrompt;
      }

      if (request.tools?.length) {
        body.tools = request.tools.map((t) => ({
          name: t.name,
          description: t.description,
          input_schema: t.parameters,
        }));
      }

      const signal = this.resolveTimeoutSignal(request.timeoutMs, request.signal);
      const init: RequestInit = {
        method: "POST",
        headers: this.getHeaders(),
        body: JSON.stringify(body),
      };
      init.signal = signal;

      const res = await fetch(`${this.baseUrl}/messages`, init);

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`Anthropic API error (${res.status}): ${errorText}`);
      }

      const response = (await res.json()) as AnthropicCompletionResponse;

      const latencyMs = performance.now() - start;
      const usage = this.parseUsage(response.usage);
      this.trackSuccess(usage.inputTokens, usage.outputTokens, latencyMs);

      const textContent = response.content
        .filter((c): c is { type: "text"; text: string } => c.type === "text")
        .map((c) => c.text)
        .join("");

      const toolCalls = response.content
        .filter(
          (c): c is { type: "tool_use"; id: string; name: string; input: unknown } =>
            c.type === "tool_use"
        )
        .map((c) => ({
          id: c.id,
          name: c.name,
          arguments: JSON.stringify(c.input),
        }));

      return {
        content: textContent,
        toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
        usage,
        finishReason: this.mapFinishReason(response.stop_reason),
        model: response.model,
        latencyMs,
      };
    } catch (error) {
      this.trackFailure();
      throw error;
    }
  }

  async *stream(request: CompletionRequest): AsyncIterable<StreamChunk> {
    const body = this.buildStreamBody(request);
    const start = performance.now();
    const usage = { inputTokens: 0, outputTokens: 0 };
    let _finishReason: CompletionResponse["finishReason"] = "stop";

    try {
      const res = await this.fetchStreamResponse(body, request);
      const reader = this.getStreamReader(res);

      for await (const chunk of this.parseStream(reader)) {
        this.updateStreamUsage(chunk, usage, (finishReason) => {
          _finishReason = finishReason;
        });
        yield chunk;
      }

      const latencyMs = performance.now() - start;
      this.trackSuccess(usage.inputTokens, usage.outputTokens, latencyMs);
    } catch (error) {
      this.trackFailure();
      yield { type: "error", error: error instanceof Error ? error.message : "Unknown error" };
    }
  }

  private buildStreamBody(request: CompletionRequest): Record<string, unknown> {
    const model = this.getModel(request.model);
    const { systemPrompt, messages } = this.formatMessages(request.messages);
    const body: Record<string, unknown> = {
      model,
      messages,
      max_tokens: request.maxTokens || 4096,
      temperature: request.temperature,
      stream: true,
    };

    if (systemPrompt) {
      body.system = systemPrompt;
    }

    return body;
  }

  private async fetchStreamResponse(
    body: Record<string, unknown>,
    request: CompletionRequest
  ): Promise<Response> {
    const signal = this.resolveOptionalSignal(request.timeoutMs, request.signal);
    const init: RequestInit = {
      method: "POST",
      headers: this.getHeaders(),
      body: JSON.stringify(body),
    };
    if (signal) {
      init.signal = signal;
    }

    const res = await fetch(`${this.baseUrl}/messages`, init);
    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`Anthropic API error (${res.status}): ${errorText}`);
    }
    return res;
  }

  private getStreamReader(res: Response): ReadableStreamDefaultReader<Uint8Array> {
    const reader = res.body?.getReader();
    if (!reader) {
      throw new Error("No response body");
    }
    return reader;
  }

  private async *parseStream(
    reader: ReadableStreamDefaultReader<Uint8Array>
  ): AsyncIterable<StreamChunk> {
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        const chunk = this.parseSSELine(line);
        if (chunk) {
          yield chunk;
        }
      }
    }
  }

  private updateStreamUsage(
    chunk: StreamChunk,
    usage: { inputTokens: number; outputTokens: number },
    recordFinishReason: (finishReason: CompletionResponse["finishReason"]) => void
  ): void {
    if (chunk.type === "usage" && chunk.usage) {
      usage.inputTokens = chunk.usage.inputTokens;
      usage.outputTokens = chunk.usage.outputTokens;
    }
    if (chunk.type === "done") {
      recordFinishReason(chunk.finishReason ?? "stop");
    }
  }

  private parseSSELine(line: string): StreamChunk | null {
    if (!line.startsWith("data: ")) {
      return null;
    }
    const data = line.slice(6).trim();
    if (!data) {
      return null;
    }

    try {
      const event = JSON.parse(data) as AnthropicStreamEvent;

      switch (event.type) {
        case "content_block_delta":
          if (event.delta?.type === "text_delta" && event.delta.text) {
            return { type: "content", content: event.delta.text };
          }
          break;

        case "message_delta":
          if (event.usage) {
            return {
              type: "usage",
              usage: {
                inputTokens: event.usage.input_tokens ?? 0,
                outputTokens: event.usage.output_tokens ?? 0,
                totalTokens: (event.usage.input_tokens ?? 0) + (event.usage.output_tokens ?? 0),
              },
            };
          }
          break;

        case "message_start":
          if (event.message?.usage) {
            return {
              type: "usage",
              usage: this.parseUsage(event.message.usage),
            };
          }
          break;

        case "message_stop":
          return { type: "done", finishReason: "stop" };

        default:
          break;
      }

      return null;
    } catch {
      return null;
    }
  }

  /**
   * Anthropic doesn't provide embeddings - throw not supported error.
   */
  async embed(_request: EmbeddingRequest): Promise<EmbeddingResponse> {
    throw new Error("Anthropic does not support embeddings. Use OpenAI or another provider.");
  }

  protected async performHealthCheck(): Promise<void> {
    // Anthropic doesn't have a dedicated health endpoint, so we make a minimal request
    const res = await fetch(`${this.baseUrl}/messages`, {
      method: "POST",
      headers: this.getHeaders(),
      body: JSON.stringify({
        model: this.defaultModel,
        max_tokens: 1,
        messages: [{ role: "user", content: "hi" }],
      }),
      signal: this.createTimeoutSignal(10000),
    });

    // 200 means healthy, 400 means the API is reachable (bad request is fine for health check)
    if (!res.ok && res.status !== 400) {
      throw new Error(`Health check failed: ${res.status}`);
    }
  }

  protected getHeaders(): Record<string, string> {
    return {
      "Content-Type": "application/json",
      "x-api-key": this.config.apiKey,
      "anthropic-version": this.apiVersion,
    };
  }

  protected formatMessages(messages: Message[]): {
    systemPrompt: string | null;
    messages: AnthropicMessage[];
  } {
    let systemPrompt: string | null = null;
    const formattedMessages: AnthropicMessage[] = [];

    for (const msg of messages) {
      if (msg.role === "system") {
        // Anthropic uses a separate system parameter
        systemPrompt = systemPrompt ? `${systemPrompt}\n${msg.content}` : msg.content;
      } else {
        formattedMessages.push({
          role: msg.role as "user" | "assistant",
          content: msg.content,
        });
      }
    }

    // Ensure messages start with user message (Anthropic requirement)
    if (formattedMessages.length > 0 && formattedMessages[0].role !== "user") {
      formattedMessages.unshift({ role: "user", content: "Hello" });
    }

    return { systemPrompt, messages: formattedMessages };
  }

  protected parseUsage(usage: { input_tokens: number; output_tokens: number }): TokenUsage {
    return {
      inputTokens: usage.input_tokens,
      outputTokens: usage.output_tokens,
      totalTokens: usage.input_tokens + usage.output_tokens,
    };
  }

  protected mapFinishReason(reason: string | null): CompletionResponse["finishReason"] {
    switch (reason) {
      case "end_turn":
      case "stop_sequence":
        return "stop";
      case "max_tokens":
        return "length";
      case "tool_use":
        return "tool_calls";
      default:
        return "stop";
    }
  }
}
