import { MODEL_CAPABILITIES, type ModelCapability, getModelCapability } from "@/lib/ai/models";
import {
  type ModelProvider,
  getFirstModelByProvider,
  resolveModelSelection,
} from "./modelResolver";

export type ProviderKind = "openai-compatible" | "anthropic" | "gemini";

export type ProviderConfig = {
  provider: ModelProvider;
  kind: ProviderKind;
  apiKeys: string[];
  baseUrl?: string;
};

export type ProviderTarget = {
  modelId: string;
  provider: ModelProvider;
  capability: ModelCapability;
  config: ProviderConfig;
};

export type ProviderResolutionErrorCode =
  | "unknown_model"
  | "unsupported_provider"
  | "provider_not_configured"
  | "no_provider_configured";

export type ProviderResolutionError = {
  code: ProviderResolutionErrorCode;
  message: string;
  provider?: ModelProvider;
};

type ProviderEnvConfig = {
  kind: ProviderKind;
  apiKeyEnv: string[];
  baseUrlEnv?: string[];
  defaultBaseUrl?: string;
  normalizeBaseUrl?: (value: string) => string;
};

const normalizeBaseUrl = (value: string): string => value.replace(/\/$/, "");

const normalizeAnthropicBaseUrl = (value: string): string => {
  const trimmed = normalizeBaseUrl(value);
  if (trimmed.endsWith("/v1/messages")) {
    return trimmed.replace(/\/messages$/, "");
  }
  return trimmed.endsWith("/v1") ? trimmed : `${trimmed}/v1`;
};

const isGoogleBaseUrl = (value: string): boolean => {
  const normalized = value.toLowerCase();
  return (
    normalized.includes("generativelanguage.googleapis.com") ||
    normalized.includes("ai.google.dev") ||
    normalized.includes("googleapis.com")
  );
};

const PROVIDER_ENV_CONFIG: Record<ModelProvider, ProviderEnvConfig> = {
  gemini: {
    kind: "gemini",
    apiKeyEnv: ["GEMINI_API_KEY", "AI_GEMINI_API_KEY"],
    baseUrlEnv: ["GEMINI_BASE_URL", "AI_GEMINI_BASE_URL"],
    normalizeBaseUrl,
  },
  claude: {
    kind: "anthropic",
    apiKeyEnv: ["ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN", "AI_CLAUDE_API_KEY"],
    baseUrlEnv: ["ANTHROPIC_BASE_URL", "AI_CLAUDE_BASE_URL"],
    defaultBaseUrl: "https://api.anthropic.com/v1",
    normalizeBaseUrl: normalizeAnthropicBaseUrl,
  },
  openai: {
    kind: "openai-compatible",
    apiKeyEnv: ["OPENAI_API_KEY", "AI_OPENAI_API_KEY"],
    baseUrlEnv: ["OPENAI_BASE_URL", "AI_OPENAI_BASE_URL"],
    defaultBaseUrl: "https://api.openai.com/v1",
    normalizeBaseUrl,
  },
  deepseek: {
    kind: "openai-compatible",
    apiKeyEnv: ["DEEPSEEK_API_KEY", "AI_DEEPSEEK_API_KEY"],
    baseUrlEnv: ["DEEPSEEK_BASE_URL", "AI_DEEPSEEK_BASE_URL"],
    defaultBaseUrl: "https://api.deepseek.com/v1",
    normalizeBaseUrl,
  },
  meta: {
    kind: "openai-compatible",
    apiKeyEnv: ["META_API_KEY", "AI_META_API_KEY"],
    baseUrlEnv: ["META_BASE_URL", "AI_META_BASE_URL"],
    normalizeBaseUrl,
  },
  alibaba: {
    kind: "openai-compatible",
    apiKeyEnv: ["QWEN_API_KEY", "ALIBABA_API_KEY", "AI_ALIBABA_API_KEY"],
    baseUrlEnv: ["QWEN_API_ENDPOINT", "QWEN_BASE_URL", "ALIBABA_BASE_URL", "AI_ALIBABA_BASE_URL"],
    defaultBaseUrl: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
    normalizeBaseUrl,
  },
  minimax: {
    kind: "openai-compatible",
    apiKeyEnv: ["MINIMAX_API_KEY", "AI_MINIMAX_API_KEY"],
    baseUrlEnv: ["MINIMAX_BASE_URL", "AI_MINIMAX_BASE_URL"],
    normalizeBaseUrl,
  },
  moonshot: {
    kind: "openai-compatible",
    apiKeyEnv: ["MOONSHOT_API_KEY", "AI_MOONSHOT_API_KEY"],
    baseUrlEnv: ["MOONSHOT_BASE_URL", "AI_MOONSHOT_BASE_URL"],
    defaultBaseUrl: "https://api.moonshot.cn/v1",
    normalizeBaseUrl,
  },
  xai: {
    kind: "openai-compatible",
    apiKeyEnv: ["XAI_API_KEY", "AI_XAI_API_KEY"],
    baseUrlEnv: ["XAI_BASE_URL", "AI_XAI_BASE_URL"],
    normalizeBaseUrl,
  },
  zai: {
    kind: "openai-compatible",
    apiKeyEnv: ["ZAI_API_KEY", "ZHIPU_API_KEY", "AI_ZAI_API_KEY"],
    baseUrlEnv: ["ZAI_BASE_URL", "ZHIPU_BASE_URL", "AI_ZAI_BASE_URL"],
    normalizeBaseUrl,
  },
  stealth: {
    kind: "openai-compatible",
    apiKeyEnv: ["STEALTH_API_KEY", "AI_STEALTH_API_KEY"],
    baseUrlEnv: ["STEALTH_BASE_URL", "AI_STEALTH_BASE_URL"],
    normalizeBaseUrl,
  },
};

const getFirstEnvValue = (keys: string[]): string | null => {
  for (const key of keys) {
    const value = process.env[key];
    if (value && value.trim().length > 0) {
      return value.trim();
    }
  }
  return null;
};

const parseApiKeys = (value: string | null): string[] =>
  value
    ? value
        .split(",")
        .map((entry) => entry.trim())
        .filter(Boolean)
    : [];

const _normalizeModelId = (value?: string | null): string | null => {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : null;
};

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Provider matrix requires branching across many vendors
export function resolveProviderConfig(provider: ModelProvider): ProviderConfig | null {
  const envConfig = PROVIDER_ENV_CONFIG[provider];
  const apiKeys = parseApiKeys(getFirstEnvValue(envConfig.apiKeyEnv));
  if (apiKeys.length === 0) {
    return null;
  }

  const baseValue = envConfig.baseUrlEnv ? getFirstEnvValue(envConfig.baseUrlEnv) : null;
  const baseUrlRaw = baseValue ?? envConfig.defaultBaseUrl ?? null;
  const baseUrl =
    baseUrlRaw && baseUrlRaw.trim().length > 0
      ? (envConfig.normalizeBaseUrl ?? normalizeBaseUrl)(baseUrlRaw)
      : undefined;

  let resolvedKind = envConfig.kind;
  const forcedKind =
    process.env.AI_GEMINI_KIND ?? process.env.GEMINI_KIND ?? process.env.AI_GEMINI_PROTOCOL;
  if (provider === "gemini") {
    if (forcedKind === "openai-compatible") {
      resolvedKind = "openai-compatible";
    } else if (forcedKind === "gemini" || forcedKind === "native") {
      resolvedKind = "gemini";
    } else if (baseUrl && !isGoogleBaseUrl(baseUrl)) {
      // Non-Google endpoints default to OpenAI-compatible unless explicitly forced to native
      resolvedKind = "openai-compatible";
    }
  }

  return {
    provider,
    kind: resolvedKind,
    apiKeys,
    baseUrl,
  };
}

export function pickApiKey(config: ProviderConfig): string {
  if (config.apiKeys.length === 1) {
    return config.apiKeys[0];
  }
  return config.apiKeys[Math.floor(Math.random() * config.apiKeys.length)];
}

export function getConfiguredProviders(allowedProviders?: ModelProvider[]): ModelProvider[] {
  const seen = new Set<ModelProvider>();
  const providers: ModelProvider[] = [];

  for (const capability of MODEL_CAPABILITIES) {
    if (seen.has(capability.provider)) {
      continue;
    }
    seen.add(capability.provider);

    if (allowedProviders && !allowedProviders.includes(capability.provider)) {
      continue;
    }

    if (resolveProviderConfig(capability.provider)) {
      providers.push(capability.provider);
    }
  }

  return providers;
}

function getFallbackTarget(allowedProviders?: ModelProvider[]): ProviderTarget | null {
  const configuredProviders = getConfiguredProviders(allowedProviders);
  const fallbackProvider = configuredProviders[0];
  if (!fallbackProvider) {
    return null;
  }

  const fallbackModelId = getFirstModelByProvider([fallbackProvider]);
  const capability = getModelCapability(fallbackModelId);
  const config = resolveProviderConfig(fallbackProvider);

  if (!capability || !config) {
    return null;
  }

  return {
    modelId: fallbackModelId,
    provider: fallbackProvider,
    capability,
    config,
  };
}

export function resolveProviderTarget(options: {
  requestedModel?: string | null;
  defaultModelId: string;
  allowedProviders?: ModelProvider[];
}): { target?: ProviderTarget; error?: ProviderResolutionError } {
  const explicitModel = options.requestedModel?.trim() || null;
  const candidateModel = explicitModel ?? options.defaultModelId;

  const resolved = resolveModelSelection({
    requestedModel: candidateModel,
    defaultModelId: options.defaultModelId,
    allowedProviders: options.allowedProviders,
  });

  if (resolved.error || !resolved.provider || !resolved.capability) {
    return {
      error: {
        code: resolved.error?.code ?? "unknown_model",
        message: resolved.error?.message ?? "Model selection failed",
        provider: resolved.provider,
      },
    };
  }

  const config = resolveProviderConfig(resolved.provider);
  if (config) {
    return {
      target: {
        modelId: resolved.modelId,
        provider: resolved.provider,
        capability: resolved.capability,
        config,
      },
    };
  }

  if (explicitModel) {
    return {
      error: {
        code: "provider_not_configured",
        message: `Provider not configured: ${resolved.provider}`,
        provider: resolved.provider,
      },
    };
  }

  const fallback = getFallbackTarget(options.allowedProviders);
  if (!fallback) {
    return {
      error: {
        code: "no_provider_configured",
        message: "No AI provider configured",
      },
    };
  }

  return { target: fallback };
}
