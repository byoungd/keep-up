import {
  MODEL_CAPABILITIES,
  type ModelCapability,
  getDefaultModel,
  getModelCapability,
} from "@/lib/ai/models";

export type ModelProvider = ModelCapability["provider"];

export type ModelResolution = {
  modelId: string;
  capability?: ModelCapability;
  provider?: ModelProvider;
  error?: { code: "unknown_model" | "unsupported_provider"; message: string };
};

const MODEL_ALIASES: Record<string, string> = {
  "gemini-3.0-flash": "gemini-3-flash",
  "gemini-3.0-pro": "gemini-3-pro-high",
  "gemini-3-pro": "gemini-3-pro-high",
};

function normalizeModelId(value?: string | null): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed || trimmed.length === 0) {
    return undefined;
  }
  return MODEL_ALIASES[trimmed] ?? trimmed;
}

export function getFirstModelByProvider(providers: ModelProvider[]): string {
  return (
    MODEL_CAPABILITIES.find((entry) => providers.includes(entry.provider))?.id ??
    getDefaultModel().id
  );
}

export function getDefaultChatModelId(): string {
  return (
    normalizeModelId(process.env.AI_CHAT_MODEL) ??
    normalizeModelId(process.env.AI_DEFAULT_MODEL) ??
    getDefaultModel().id
  );
}

export function getDefaultStreamModelId(): string {
  return (
    normalizeModelId(process.env.AI_STREAM_MODEL) ??
    normalizeModelId(process.env.AI_DEFAULT_MODEL) ??
    getFirstModelByProvider(["gemini", "claude"])
  );
}

export function getDefaultResearchModelId(): string {
  return (
    normalizeModelId(process.env.AI_RESEARCH_MODEL) ??
    normalizeModelId(process.env.AI_DEFAULT_MODEL) ??
    getFirstModelByProvider(["gemini", "claude"])
  );
}

export function resolveModelSelection(options: {
  requestedModel?: string | null;
  defaultModelId: string;
  allowedProviders?: ModelProvider[];
}): ModelResolution {
  const modelId = normalizeModelId(options.requestedModel) ?? options.defaultModelId;
  const capability = getModelCapability(modelId);

  if (!capability) {
    return {
      modelId,
      error: {
        code: "unknown_model",
        message: `Model not allowed: ${modelId}`,
      },
    };
  }

  if (options.allowedProviders && !options.allowedProviders.includes(capability.provider)) {
    return {
      modelId,
      capability,
      provider: capability.provider,
      error: {
        code: "unsupported_provider",
        message: `Model provider not supported for this route: ${capability.provider}`,
      },
    };
  }

  return { modelId, capability, provider: capability.provider };
}
