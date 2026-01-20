import {
  type AICoreProvider,
  createAICoreAdapter,
  createCompletionToolServer,
  createEventBus,
  createRuntime,
  createSessionState,
  createToolRegistry,
  type RuntimeEventBus,
  type RuntimeInstance,
} from "@ku0/agent-runtime";
import type { AgentMessage, AgentState } from "@ku0/agent-runtime-core";
import {
  type CompletionRequest,
  type CompletionResponse,
  createAnthropicAdapter,
  createGoogleAdapter,
  createOpenAIAdapter,
  getConfiguredProviders,
  type LLMProvider,
  type ProviderKind,
  resolveProviderFromEnv,
  type StreamChunk,
} from "@ku0/ai-core";
import type { SessionMessage } from "./index";

export interface RuntimeConfigOptions {
  model?: string;
  provider?: string;
  sessionId?: string;
  initialMessages?: SessionMessage[];
}

export interface RuntimeResources {
  runtime: RuntimeInstance;
  eventBus: RuntimeEventBus;
}

export async function createRuntimeResources(
  options: RuntimeConfigOptions
): Promise<RuntimeResources> {
  const providerSelection = resolveProviderSelection(options.provider);
  const model = normalizeModel(options.model);
  const llmProvider = createProvider(providerSelection.providerId, providerSelection, model);
  const aiCoreProvider = createAICoreProvider(llmProvider);
  const llm = createAICoreAdapter(aiCoreProvider, {
    model: model ?? llmProvider.defaultModel,
  });

  const eventBus = createEventBus();
  const registry = createToolRegistry();
  await registry.register(createCompletionToolServer());
  const sessionState = createSessionState({
    id: options.sessionId,
    initialState: buildInitialAgentState(options.initialMessages ?? []),
  });

  const runtime = await createRuntime({
    components: {
      llm,
      registry,
      eventBus,
      sessionState,
    },
  });

  return { runtime, eventBus };
}

export function resolveProviderSelection(providerOverride?: string) {
  const requested = normalizeProvider(providerOverride);
  if (requested) {
    const resolved = resolveProviderFromEnv(requested);
    if (!resolved) {
      throw new Error(`Provider "${requested}" is not configured in the environment.`);
    }
    return { providerId: requested, ...resolved };
  }

  const configured = getConfiguredProviders();
  if (configured.length === 0) {
    throw new Error(
      "No configured AI providers found. Set provider API keys in the environment (e.g., OPENAI_API_KEY)."
    );
  }

  const providerId = configured[0];
  const resolved = resolveProviderFromEnv(providerId);
  if (!resolved) {
    throw new Error(`Provider "${providerId}" is not configured in the environment.`);
  }

  return { providerId, ...resolved };
}

function normalizeProvider(provider?: string): ProviderKind | undefined {
  if (!provider || provider === "auto") {
    return undefined;
  }
  return provider as ProviderKind;
}

function normalizeModel(model?: string): string | undefined {
  if (!model || model === "auto") {
    return undefined;
  }
  return model;
}

export function createProvider(
  providerId: ProviderKind,
  resolved: { apiKeys: string[]; baseUrl?: string; protocol: string },
  model?: string
): LLMProvider {
  const apiKey = resolved.apiKeys[0];
  const baseUrl = resolved.baseUrl;

  switch (resolved.protocol) {
    case "anthropic":
      return createAnthropicAdapter({ apiKey, baseUrl, defaultModel: model });
    case "gemini":
      return createGoogleAdapter({ apiKey, baseUrl, defaultModel: model });
    case "openai-compatible":
      return createOpenAIAdapter({ apiKey, baseUrl, defaultModel: model });
    default:
      throw new Error(`Unsupported provider protocol for ${providerId}.`);
  }
}

function createAICoreProvider(provider: LLMProvider): AICoreProvider {
  return {
    name: provider.name,
    complete: async (request) => {
      const response = await provider.complete(toCompletionRequest(provider, request));
      return toAICoreResponse(response);
    },
    stream: async function* (request) {
      const completionRequest = toCompletionRequest(provider, request);
      for await (const chunk of provider.stream(completionRequest)) {
        const mapped = toAICoreStreamChunk(chunk);
        if (mapped) {
          yield mapped;
        }
      }
    },
  };
}

function toCompletionRequest(
  provider: LLMProvider,
  request: AICoreProviderRequest
): CompletionRequest {
  return {
    model: request.model ?? provider.defaultModel,
    messages: request.messages.map((message) => ({
      role: message.role as CompletionRequest["messages"][number]["role"],
      content: message.content,
    })),
    temperature: request.temperature,
    maxTokens: request.maxTokens,
    tools: request.tools?.map((tool) => ({
      name: tool.name,
      description: tool.description,
      parameters: tool.inputSchema,
    })),
  };
}

export function toAICoreResponse(response: CompletionResponse): AICoreProviderResponse {
  return {
    content: response.content,
    toolCalls: response.toolCalls?.map((toolCall) => ({
      id: toolCall.id,
      name: toolCall.name,
      arguments: safeParseArguments(toolCall.arguments),
    })),
    usage: response.usage
      ? {
          inputTokens: response.usage.inputTokens,
          outputTokens: response.usage.outputTokens,
          totalTokens: response.usage.totalTokens,
        }
      : undefined,
    finishReason: normalizeFinishReason(response.finishReason),
  };
}

function toAICoreStreamChunk(chunk: StreamChunk): AICoreProviderStreamChunk | null {
  if (chunk.type === "content") {
    return { type: "content", content: chunk.content ?? "" };
  }
  if (chunk.type === "tool_call" && chunk.toolCall) {
    return {
      type: "tool_call",
      toolCall: {
        id: chunk.toolCall.id ?? "",
        name: chunk.toolCall.name ?? "",
        arguments: safeParseArguments(chunk.toolCall.arguments ?? "{}"),
      },
    };
  }
  if (chunk.type === "error") {
    return { type: "error", error: chunk.error ?? "Stream error" };
  }
  if (chunk.type === "done") {
    return { type: "done" };
  }
  return null;
}

function normalizeFinishReason(reason: CompletionResponse["finishReason"]): string {
  if (reason === "tool_calls") {
    return "tool_use";
  }
  if (reason === "length") {
    return "max_tokens";
  }
  return reason;
}

function safeParseArguments(raw: string | Record<string, unknown>): Record<string, unknown> {
  if (typeof raw === "object" && raw !== null) {
    return raw;
  }
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : { raw };
  } catch {
    return { raw };
  }
}

function buildInitialAgentState(messages: SessionMessage[]): AgentState {
  const agentMessages: AgentMessage[] = messages.map((message) => ({
    role: message.role,
    content: message.content,
  }));
  const turnCount = agentMessages.filter((message) => message.role === "assistant").length;

  return {
    turn: turnCount,
    status: "idle",
    messages: agentMessages,
    pendingToolCalls: [],
  };
}

type AICoreProviderRequest = {
  model?: string;
  messages: Array<{ role: string; content: string }>;
  temperature?: number;
  maxTokens?: number;
  tools?: Array<{ name: string; description: string; inputSchema: Record<string, unknown> }>;
};

type AICoreProviderResponse = {
  content: string;
  toolCalls?: Array<{ id: string; name: string; arguments: Record<string, unknown> }>;
  usage?: { inputTokens: number; outputTokens: number; totalTokens?: number };
  finishReason?: string;
};

type AICoreProviderStreamChunk =
  | { type: "content"; content: string }
  | {
      type: "tool_call";
      toolCall: { id: string; name: string; arguments: Record<string, unknown> };
    }
  | { type: "done" }
  | { type: "error"; error: string };
