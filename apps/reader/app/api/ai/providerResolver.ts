import { MODEL_CAPABILITIES, getDefaultModel } from "@/lib/ai/models";
import {
  type ModelCapability,
  type ProviderKind,
  type ProviderProtocol,
  getModelCapability,
  resolveProviderFromEnv,
} from "@ku0/ai-core";
import { type ModelProvider, resolveModelSelection } from "./modelResolver";

// Re-export types for backwards compatibility
export type { ProviderKind as ProviderKindLegacy } from "@ku0/ai-core";

export type ProviderConfig = {
  provider: ModelProvider;
  kind: ProviderProtocol;
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

/**
 * Resolve provider configuration from environment using the centralized catalog.
 */
export function resolveProviderConfig(provider: ModelProvider): ProviderConfig | null {
  const resolved = resolveProviderFromEnv(provider as ProviderKind);
  if (!resolved) {
    return null;
  }

  return {
    provider,
    kind: resolved.protocol,
    apiKeys: resolved.apiKeys,
    baseUrl: resolved.baseUrl,
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

function getFirstModelByProvider(providers: ModelProvider[]): string {
  return (
    MODEL_CAPABILITIES.find((entry) => providers.includes(entry.provider))?.id ??
    getDefaultModel().id
  );
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
