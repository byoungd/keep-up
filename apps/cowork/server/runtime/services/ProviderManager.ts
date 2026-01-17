/**
 * Provider manager service
 * Handles LLM provider selection, routing, and configuration
 */

import {
  type CompletionRequest,
  type CompletionResponse,
  createAnthropicAdapter,
  createGoogleAdapter,
  createOpenAIAdapter,
  getModelCapability,
  type LLMProvider,
  normalizeModelId,
  ProviderRouter,
  resolveProviderFromEnv,
  type StreamChunk,
  type Tool,
} from "@ku0/ai-core";
import type { ProviderKeyService } from "../../services/providerKeyService";
import type { CoworkProviderId, CoworkSettings } from "../../storage/types";
import { SmartProviderRouter } from "../smartProviderRouter";
import { estimateTokens, inferTaskType } from "../utils";

type Logger = Pick<Console, "info" | "warn" | "error">;
export class ProviderManager {
  constructor(
    private readonly logger: Logger,
    private readonly providerKeys: ProviderKeyService
  ) {}

  /**
   * Create provider configuration for a session
   */
  async createProvider(
    settings: CoworkSettings,
    selectionHint?: { prompt?: string }
  ): Promise<{
    provider: unknown;
    model: string;
    providerId: CoworkProviderId;
    fallbackNotice?: string;
  }> {
    const providers = await this.resolveProviders();
    this.ensureProviders(providers);

    const requestedModel = normalizeModelId(settings.defaultModel ?? undefined) ?? null;
    const preferred = this.resolvePreferredProvider(requestedModel ?? undefined);
    const availableProviders = providers.map((provider) => ({
      providerId: provider.name as CoworkProviderId,
      defaultModel: provider.defaultModel,
    }));

    const { selectedModel, selectedProvider } = this.selectModelAndProvider({
      requestedModel,
      preferred,
      selectionHint,
      availableProviders,
    });

    const { primary, fallbackOrder, fallbackNotice, selectedProviderAvailable } =
      this.resolveProviderFallback({
        providers,
        preferred,
        requestedModel,
        selectedProvider,
      });

    const router = new ProviderRouter({
      primaryProvider: primary,
      fallbackOrder,
      enableFallback: true,
    });

    for (const provider of providers) {
      router.registerProvider(provider);
    }

    router.startHealthChecks();

    const resolvedModel =
      selectedProviderAvailable && selectedModel
        ? selectedModel
        : (providers.find((provider) => provider.name === primary)?.defaultModel ?? "");

    return {
      provider: this.createProviderAdapter(router, "cowork"),
      model: resolvedModel,
      providerId: primary,
      fallbackNotice,
    };
  }

  /**
   * Resolve available LLM providers from settings and environment
   */
  private async resolveProviders(): Promise<LLMProvider[]> {
    const openaiEnv = resolveProviderFromEnv("openai");
    const claudeEnv = resolveProviderFromEnv("claude");
    const geminiEnv = resolveProviderFromEnv("gemini");

    const [openAiKey, anthropicKey, geminiKey] = await Promise.all([
      this.providerKeys.getResolvedKey("openai"),
      this.providerKeys.getResolvedKey("anthropic"),
      this.providerKeys.getResolvedKey("gemini"),
    ]);
    const geminiBaseUrl =
      geminiEnv?.baseUrl || "https://generativelanguage.googleapis.com/v1beta/openai";

    const providers: LLMProvider[] = [];
    if (openAiKey) {
      providers.push(createOpenAIAdapter({ apiKey: openAiKey, baseUrl: openaiEnv?.baseUrl }));
    }
    if (anthropicKey) {
      providers.push(createAnthropicAdapter({ apiKey: anthropicKey, baseUrl: claudeEnv?.baseUrl }));
    }
    if (geminiKey) {
      providers.push(createGoogleAdapter({ apiKey: geminiKey, baseUrl: geminiBaseUrl }));
    }
    return providers;
  }

  /**
   * Ensure at least one provider is available
   */
  private ensureProviders(providers: LLMProvider[]): void {
    if (providers.length === 0) {
      throw new Error("No AI provider configured. Add an API key in settings or env.");
    }
  }

  /**
   * Select model and provider based on request and hints
   */
  private selectModelAndProvider(options: {
    requestedModel: string | null;
    preferred: CoworkProviderId | undefined;
    selectionHint?: { prompt?: string };
    availableProviders: Array<{ providerId: CoworkProviderId; defaultModel: string }>;
  }): { selectedModel: string | null; selectedProvider: CoworkProviderId | null } {
    let selectedModel = options.requestedModel;
    let selectedProvider = options.preferred ?? null;

    if (!selectedModel && options.selectionHint?.prompt) {
      const taskType = inferTaskType(options.selectionHint.prompt);
      const estimatedInputTokens = estimateTokens(options.selectionHint.prompt);
      const estimatedOutputTokens = Math.max(128, Math.round(estimatedInputTokens * 0.6));
      const smartRouter = new SmartProviderRouter(options.availableProviders);
      const selection = smartRouter.selectProvider({
        taskType,
        estimatedInputTokens,
        estimatedOutputTokens,
      });
      selectedModel = normalizeModelId(selection.modelId) ?? selection.modelId;
      selectedProvider = selection.providerId;
    }

    return { selectedModel, selectedProvider };
  }

  /**
   * Resolve provider fallback configuration
   */
  private resolveProviderFallback(options: {
    providers: LLMProvider[];
    preferred: CoworkProviderId | undefined;
    requestedModel: string | null;
    selectedProvider: CoworkProviderId | null;
  }): {
    primary: CoworkProviderId;
    fallbackOrder: CoworkProviderId[];
    fallbackNotice?: string;
    selectedProviderAvailable: boolean;
  } {
    const providerNames = options.providers.map((provider) => provider.name as CoworkProviderId);
    const selectedProviderAvailable = Boolean(
      options.selectedProvider && providerNames.includes(options.selectedProvider)
    );
    const primary: CoworkProviderId =
      selectedProviderAvailable && options.selectedProvider
        ? options.selectedProvider
        : (providerNames[0] ?? "openai");
    const fallbackOrder = providerNames.filter((name) => name !== primary);
    const requestedProviderAvailable = Boolean(
      options.preferred && providerNames.includes(options.preferred)
    );
    const fallbackNotice =
      options.requestedModel && options.preferred && !requestedProviderAvailable
        ? `Requested provider ${options.preferred} unavailable. Using ${primary} instead.`
        : undefined;

    if (options.requestedModel && options.preferred && !requestedProviderAvailable) {
      this.logger.warn("Requested model provider not available, falling back.", {
        requestedModel: options.requestedModel,
        preferred: options.preferred,
        primary,
      });
    }

    return {
      primary,
      fallbackOrder,
      fallbackNotice,
      selectedProviderAvailable,
    };
  }

  /**
   * Resolve preferred provider from model name
   */
  private resolvePreferredProvider(model: string | undefined): CoworkProviderId | undefined {
    if (!model) {
      return undefined;
    }
    const capability = getModelCapability(model);
    if (capability?.provider === "openai") {
      return "openai";
    }
    if (capability?.provider === "gemini") {
      return "gemini";
    }
    if (capability?.provider === "claude") {
      return "anthropic";
    }
    const lower = model.toLowerCase();
    if (lower.includes("claude")) {
      return "anthropic";
    }
    if (lower.includes("gemini")) {
      return "gemini";
    }
    if (
      lower.includes("gpt") ||
      lower.includes("o1") ||
      lower.includes("o3") ||
      lower.includes("o4")
    ) {
      return "openai";
    }
    return undefined;
  }

  /**
   * Create provider adapter for compatibility
   */
  private createProviderAdapter(provider: Pick<LLMProvider, "complete" | "stream">, name: string) {
    return {
      name,
      async complete(request: {
        model?: string;
        messages: Array<{ role: string; content: string }>;
        temperature?: number;
        maxTokens?: number;
        tools?: Array<{ name: string; description: string; inputSchema: Record<string, unknown> }>;
      }) {
        const response = await provider.complete(convertRequest(request));
        return convertResponse(response);
      },
      async *stream(request: {
        model?: string;
        messages: Array<{ role: string; content: string }>;
        temperature?: number;
        maxTokens?: number;
        tools?: Array<{ name: string; description: string; inputSchema: Record<string, unknown> }>;
      }) {
        const stream = provider.stream(convertRequest(request));
        for await (const chunk of stream) {
          const mapped = convertChunk(chunk);
          if (mapped) {
            yield mapped;
          }
        }
      },
    };
  }
}

// Helper functions

function convertRequest(request: {
  model?: string;
  messages: Array<{ role: string; content: string }>;
  temperature?: number;
  maxTokens?: number;
  tools?: Array<{ name: string; description: string; inputSchema: Record<string, unknown> }>;
}): CompletionRequest {
  return {
    model: request.model ?? "",
    messages: request.messages as CompletionRequest["messages"],
    temperature: request.temperature,
    maxTokens: request.maxTokens,
    tools: request.tools?.map((tool) => ({
      name: tool.name,
      description: tool.description,
      parameters: tool.inputSchema,
    })) as Tool[] | undefined,
  };
}

function convertResponse(response: CompletionResponse) {
  return {
    content: response.content ?? "",
    toolCalls: response.toolCalls?.map((call) => ({
      id: call.id,
      name: call.name,
      arguments: parseArguments(call.arguments),
    })),
    usage: response.usage
      ? { inputTokens: response.usage.inputTokens, outputTokens: response.usage.outputTokens }
      : undefined,
    finishReason: response.finishReason,
  };
}

function convertChunk(chunk: StreamChunk) {
  switch (chunk.type) {
    case "content":
      return { type: "content" as const, content: chunk.content };
    case "tool_call":
      return chunk.toolCall?.name
        ? {
            type: "tool_call" as const,
            toolCall: {
              id: chunk.toolCall.id ?? crypto.randomUUID(),
              name: chunk.toolCall.name,
              arguments: parseArguments(chunk.toolCall.arguments),
            },
          }
        : null;
    case "error":
      return { type: "error" as const, error: chunk.error ?? "Unknown error" };
    case "done":
      return { type: "done" as const };
    default:
      return null;
  }
}

function parseArguments(value: unknown): Record<string, unknown> {
  if (typeof value === "object" && value !== null) {
    return value as Record<string, unknown>;
  }
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown;
      return typeof parsed === "object" && parsed !== null
        ? (parsed as Record<string, unknown>)
        : {};
    } catch {
      return {};
    }
  }
  return {};
}
