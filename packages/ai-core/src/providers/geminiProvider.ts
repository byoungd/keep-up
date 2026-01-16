/**
 * Gemini Provider
 *
 * OpenAI-compatible provider implementation for Google Gemini models.
 */

import { MODEL_CATALOG } from "../catalog/models";
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
  Tool,
} from "./types";

export interface GeminiConfig extends ProviderConfig {}

interface GeminiCompletionResponse {
  id: string;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: string;
      content: string | null;
      tool_calls?: Array<{
        id?: string;
        type?: string;
        function?: { name?: string; arguments?: string };
      }>;
    };
    finish_reason: string;
  }>;
  usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
}

const GEMINI_MODELS = MODEL_CATALOG.filter((model) => model.provider === "gemini").map(
  (model) => model.id
);
const GEMINI_DEFAULT_MODEL =
  MODEL_CATALOG.find((model) => model.provider === "gemini" && model.default)?.id ??
  GEMINI_MODELS[0] ??
  "gemini-3-flash";
const STREAM_DONE_MARKER = "[" + "DONE" + "]";

export class GeminiProvider extends BaseLLMProvider {
  readonly name = "gemini";
  readonly models = GEMINI_MODELS;
  readonly defaultModel = GEMINI_DEFAULT_MODEL;

  private readonly baseUrl: string;

  constructor(config: GeminiConfig) {
    super(config);
    this.baseUrl = config.baseUrl || "https://generativelanguage.googleapis.com/v1beta/openai";
  }

  async complete(request: CompletionRequest): Promise<CompletionResponse> {
    const start = performance.now();
    try {
      const model = this.getModel(request.model);
      const body: Record<string, unknown> = {
        model,
        messages: this.formatMessages(request.messages),
        temperature: request.temperature ?? 1,
        max_tokens: request.maxTokens,
      };
      if (request.tools?.length) {
        body.tools = this.formatTools(request.tools);
      }
      const signal = this.resolveTimeoutSignal(request.timeoutMs, request.signal);
      const init: RequestInit = {
        method: "POST",
        headers: this.getHeaders(),
        body: JSON.stringify(body),
      };
      init.signal = signal;

      const res = await fetch(`${this.baseUrl}/chat/completions`, init);
      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`Gemini API error (${res.status}): ${errorText}`);
      }
      const response = (await res.json()) as GeminiCompletionResponse;

      const latencyMs = performance.now() - start;
      const usage = response.usage
        ? this.parseUsage(response.usage)
        : { inputTokens: 0, outputTokens: 0, totalTokens: 0 };
      this.trackSuccess(usage.inputTokens, usage.outputTokens, latencyMs);

      const choice = response.choices[0];
      const toolCalls = choice?.message.tool_calls
        ?.map((toolCall) => {
          const name = toolCall.function?.name;
          if (!name) {
            return null;
          }
          return {
            id: toolCall.id ?? crypto.randomUUID(),
            name,
            arguments: toolCall.function?.arguments ?? "",
          };
        })
        .filter(
          (toolCall): toolCall is { id: string; name: string; arguments: string } => !!toolCall
        );

      return {
        content: choice?.message.content ?? "",
        toolCalls: toolCalls && toolCalls.length > 0 ? toolCalls : undefined,
        usage,
        finishReason: this.mapFinishReason(choice?.finish_reason),
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

    try {
      const res = await this.fetchStreamResponse(body, request);
      const reader = this.getStreamReader(res);

      for await (const chunk of this.parseStream(reader)) {
        this.updateStreamUsage(chunk, usage);
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
    const body: Record<string, unknown> = {
      model,
      messages: this.formatMessages(request.messages),
      stream: true,
    };
    if (request.tools?.length) {
      body.tools = this.formatTools(request.tools);
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

    const res = await fetch(`${this.baseUrl}/chat/completions`, init);
    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`Gemini API error (${res.status}): ${errorText}`);
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
    usage: { inputTokens: number; outputTokens: number }
  ): void {
    if (chunk.type === "usage" && chunk.usage) {
      usage.inputTokens = chunk.usage.inputTokens;
      usage.outputTokens = chunk.usage.outputTokens;
    }
    if (chunk.type === "done" && chunk.usage) {
      usage.inputTokens = chunk.usage.inputTokens;
      usage.outputTokens = chunk.usage.outputTokens;
    }
  }

  private parseSSELine(line: string): StreamChunk | null {
    if (!line.startsWith("data: ")) {
      return null;
    }
    const data = line.slice(6).trim();
    if (data === STREAM_DONE_MARKER) {
      return null;
    }
    if (!data) {
      return null;
    }

    try {
      const parsed = JSON.parse(data);
      const choice = parsed.choices?.[0];

      if (parsed.usage) {
        return {
          type: "usage",
          usage: this.parseUsage(parsed.usage),
        };
      }

      if (choice?.delta?.content) {
        return {
          type: "content",
          content: choice.delta.content,
        };
      }

      if (choice?.delta?.tool_calls?.length) {
        const toolCall = choice.delta.tool_calls[0];
        const name = toolCall.function?.name;
        if (name) {
          return {
            type: "tool_call",
            toolCall: {
              id: toolCall.id ?? crypto.randomUUID(),
              name,
              arguments: toolCall.function?.arguments ?? "",
            },
          };
        }
      }

      if (choice?.finish_reason) {
        return {
          type: "done",
          finishReason: this.mapFinishReason(choice.finish_reason),
          usage: parsed.usage ? this.parseUsage(parsed.usage) : undefined,
        };
      }

      return null;
    } catch {
      return null;
    }
  }

  async embed(_request: EmbeddingRequest): Promise<EmbeddingResponse> {
    throw new Error("Gemini embeddings are not supported in this provider.");
  }

  protected async performHealthCheck(): Promise<void> {
    const res = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: this.getHeaders(),
      body: JSON.stringify({
        model: this.defaultModel,
        max_tokens: 1,
        messages: [{ role: "user", content: "hi" }],
      }),
      signal: this.createTimeoutSignal(10000),
    });

    if (!res.ok && res.status !== 400) {
      throw new Error(`Health check failed: ${res.status}`);
    }
  }

  protected getHeaders(): Record<string, string> {
    return {
      "Content-Type": "application/json",
      Authorization: `Bearer ${this.config.apiKey}`,
    };
  }

  protected formatMessages(messages: Message[]): Array<{ role: string; content: string }> {
    return messages.map((m) => ({ role: m.role, content: m.content }));
  }

  protected formatTools(tools: Tool[]): Array<{ type: string; function: Record<string, unknown> }> {
    return tools.map((tool) => ({
      type: "function",
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
      },
    }));
  }

  protected parseUsage(usage: {
    prompt_tokens: number;
    completion_tokens?: number;
    total_tokens: number;
  }): TokenUsage {
    return {
      inputTokens: usage.prompt_tokens,
      outputTokens: usage.completion_tokens ?? 0,
      totalTokens: usage.total_tokens,
    };
  }

  protected mapFinishReason(reason: string | undefined): CompletionResponse["finishReason"] {
    switch (reason) {
      case "stop":
        return "stop";
      case "length":
        return "length";
      case "tool_calls":
      case "function_call":
        return "tool_calls";
      case "content_filter":
        return "content_filter";
      default:
        return "stop";
    }
  }
}
