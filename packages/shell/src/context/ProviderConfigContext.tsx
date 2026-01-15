"use client";

import { type ProviderKind, getProviderDisplayInfo, getProviderEnvConfig } from "@ku0/ai-core";
import * as React from "react";
import type { ModelCapability } from "../lib/ai/models";
import {
  MODEL_CAPABILITIES,
  getDefaultModel,
  getModelCapability,
  normalizeModelId,
} from "../lib/ai/models";
import { decryptApiKey, encryptApiKey, isEncrypted } from "../lib/crypto/keyEncryption";

/**
 * Provider Configuration Context
 *
 * Manages user-configured API keys and base URLs for AI providers.
 * Supports OpenAI-compatible endpoints for most providers.
 */

const SUPPORTED_PROVIDERS = [
  "openai",
  "claude",
  "gemini",
  "deepseek",
  "moonshot",
] as const satisfies readonly ProviderKind[];

export type SupportedProvider = (typeof SUPPORTED_PROVIDERS)[number];
export type ProviderId = SupportedProvider | "custom";

type SupportedModelCapability = ModelCapability & { provider: SupportedProvider };
const SUPPORTED_PROVIDER_IDS: ProviderId[] = [...SUPPORTED_PROVIDERS, "custom"];
const LEGACY_PROVIDER_IDS: Record<string, ProviderId> = {
  anthropic: "claude",
  google: "gemini",
};

/** Lane types for task-based model routing */
export type LaneId = "fast" | "deep";

/** Model lane configuration */
export interface LaneConfig {
  /** Model ID to use for this lane */
  modelId: string;
  /** Provider for this model */
  providerId: ProviderId;
}

/** Default lane configurations */
const isSupportedProvider = (provider: ProviderKind): provider is SupportedProvider =>
  SUPPORTED_PROVIDERS.includes(provider as SupportedProvider);

const pickLaneModel = (
  predicate: (model: ModelCapability) => boolean
): SupportedModelCapability => {
  const fallback =
    (MODEL_CAPABILITIES.find((model) => !model.legacy && isSupportedProvider(model.provider)) as
      | SupportedModelCapability
      | undefined) ?? (getDefaultModel() as SupportedModelCapability);

  return (
    (MODEL_CAPABILITIES.find(
      (model) => !model.legacy && isSupportedProvider(model.provider) && predicate(model)
    ) as SupportedModelCapability | undefined) ?? fallback
  );
};

const DEFAULT_FAST_MODEL = pickLaneModel((model) => model.tags.includes("fast"));
const DEFAULT_DEEP_MODEL = pickLaneModel(
  (model) =>
    model.tags.includes("quality") || model.tags.includes("thinking") || model.supports.thinking
);

const DEFAULT_LANES: Record<LaneId, LaneConfig> = {
  fast: { modelId: DEFAULT_FAST_MODEL.id, providerId: DEFAULT_FAST_MODEL.provider },
  deep: { modelId: DEFAULT_DEEP_MODEL.id, providerId: DEFAULT_DEEP_MODEL.provider },
};

export interface ProviderConfig {
  /** Whether this provider is enabled */
  enabled: boolean;
  /** API key for the provider */
  apiKey: string;
  /** Base URL (for OpenAI-compatible or custom endpoints) */
  baseUrl: string;
  /** Organization ID (optional, mainly for OpenAI) */
  organizationId?: string;
  /** Custom display name */
  displayName?: string;
}

export interface ProviderConfigState {
  providers: Record<ProviderId, ProviderConfig>;
  /** Currently active provider for new chats */
  activeProvider: ProviderId;
  /** Model lanes for task-based routing */
  lanes: Record<LaneId, LaneConfig>;
}

const DEFAULT_BASE_URLS: Record<ProviderId, string> = {
  openai: getProviderEnvConfig("openai")?.defaultBaseUrl ?? "https://api.openai.com/v1",
  claude: getProviderEnvConfig("claude")?.defaultBaseUrl ?? "https://api.anthropic.com/v1",
  gemini: "https://generativelanguage.googleapis.com/v1beta",
  deepseek: getProviderEnvConfig("deepseek")?.defaultBaseUrl ?? "https://api.deepseek.com/v1",
  moonshot: getProviderEnvConfig("moonshot")?.defaultBaseUrl ?? "https://api.moonshot.cn/v1",
  custom: "",
};

const getProviderName = (providerId: ProviderKind): string =>
  getProviderDisplayInfo(providerId)?.name ?? providerId;

const DEFAULT_PROVIDER_NAMES: Record<ProviderId, string> = {
  openai: getProviderName("openai"),
  claude: getProviderName("claude"),
  gemini: getProviderName("gemini"),
  deepseek: getProviderName("deepseek"),
  moonshot: getProviderName("moonshot"),
  custom: "Custom Provider",
};

const createDefaultConfig = (providerId: ProviderId): ProviderConfig => ({
  enabled: false,
  apiKey: "",
  baseUrl: DEFAULT_BASE_URLS[providerId],
  displayName: DEFAULT_PROVIDER_NAMES[providerId],
});

const DEFAULT_STATE: ProviderConfigState = {
  providers: {
    openai: createDefaultConfig("openai"),
    claude: createDefaultConfig("claude"),
    gemini: createDefaultConfig("gemini"),
    deepseek: createDefaultConfig("deepseek"),
    moonshot: createDefaultConfig("moonshot"),
    custom: createDefaultConfig("custom"),
  },
  activeProvider: "openai",
  lanes: DEFAULT_LANES,
};

const STORAGE_KEY = "ai-provider-config-v1";

/**
 * Decrypts all provider API keys from stored config.
 */
const migrateProviderId = (providerId: string): ProviderId | null => {
  if (providerId === "custom") {
    return "custom";
  }
  if (providerId in LEGACY_PROVIDER_IDS) {
    return LEGACY_PROVIDER_IDS[providerId];
  }
  return SUPPORTED_PROVIDERS.includes(providerId as SupportedProvider)
    ? (providerId as SupportedProvider)
    : null;
};

const resolveLaneModel = (
  modelId: string | undefined,
  fallback: SupportedModelCapability
): SupportedModelCapability => {
  const normalized = normalizeModelId(modelId);
  const resolved = normalized ? getModelCapability(normalized) : undefined;
  if (resolved && isSupportedProvider(resolved.provider)) {
    return resolved as SupportedModelCapability;
  }
  return fallback;
};

async function decryptProviderKeys(
  parsed: ProviderConfigState
): Promise<Record<ProviderId, ProviderConfig>> {
  const decryptedProviders: Record<ProviderId, ProviderConfig> = {
    ...DEFAULT_STATE.providers,
  };

  for (const [id, config] of Object.entries(parsed.providers)) {
    const providerId = migrateProviderId(id);
    if (!providerId) {
      continue;
    }
    const storedKey = config.apiKey ?? "";

    // Decrypt if the key appears to be encrypted, otherwise use as-is (migration)
    let decryptedKey = storedKey;
    if (isEncrypted(storedKey)) {
      decryptedKey = await decryptApiKey(storedKey);
    }

    decryptedProviders[providerId] = {
      ...DEFAULT_STATE.providers[providerId],
      ...config,
      apiKey: decryptedKey,
    };
  }

  return decryptedProviders;
}

/**
 * Encrypts all provider API keys for storage.
 */
async function encryptProviderKeys(
  state: ProviderConfigState
): Promise<Record<ProviderId, ProviderConfig>> {
  const encryptedProviders: Record<ProviderId, ProviderConfig> = {} as Record<
    ProviderId,
    ProviderConfig
  >;

  for (const [id, config] of Object.entries(state.providers)) {
    const providerId = id as ProviderId;
    const encryptedKey = config.apiKey ? await encryptApiKey(config.apiKey) : "";

    encryptedProviders[providerId] = {
      ...config,
      apiKey: encryptedKey,
    };
  }

  return encryptedProviders;
}

interface ProviderConfigContextValue {
  state: ProviderConfigState;
  isHydrated: boolean;
  /** Update a specific provider's configuration */
  updateProvider: (providerId: ProviderId, config: Partial<ProviderConfig>) => void;
  /** Set the active provider */
  setActiveProvider: (providerId: ProviderId) => void;
  /** Reset a provider to defaults */
  resetProvider: (providerId: ProviderId) => void;
  /** Reset all providers to defaults */
  resetAll: () => void;
  /** Check if a provider is configured (has API key) */
  isProviderConfigured: (providerId: ProviderId) => boolean;
  /** Get configured providers */
  getConfiguredProviders: () => ProviderId[];
  /** Get default base URL for a provider */
  getDefaultBaseUrl: (providerId: ProviderId) => string;
  /** Update a lane's model configuration */
  updateLane: (laneId: LaneId, config: LaneConfig) => void;
  /** Get the current lane configuration */
  getLane: (laneId: LaneId) => LaneConfig;
}

const ProviderConfigContext = React.createContext<ProviderConfigContextValue | null>(null);

export function ProviderConfigProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = React.useState<ProviderConfigState>(DEFAULT_STATE);
  const [isHydrated, setIsHydrated] = React.useState(false);

  // Load from localStorage on mount (with async decryption)
  React.useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const loadConfig = async () => {
      try {
        const stored = window.localStorage.getItem(STORAGE_KEY);
        if (stored) {
          const parsed = JSON.parse(stored) as ProviderConfigState;
          const decryptedProviders = await decryptProviderKeys(parsed);
          const migratedActiveProvider =
            (parsed.activeProvider ? migrateProviderId(parsed.activeProvider) : null) ??
            DEFAULT_STATE.activeProvider;
          const resolvedFastModel = resolveLaneModel(
            parsed.lanes?.fast?.modelId,
            DEFAULT_FAST_MODEL
          );
          const resolvedDeepModel = resolveLaneModel(
            parsed.lanes?.deep?.modelId,
            DEFAULT_DEEP_MODEL
          );

          setState({
            ...DEFAULT_STATE,
            ...parsed,
            activeProvider: migratedActiveProvider,
            providers: decryptedProviders,
            // Merge lanes with defaults for migration
            lanes: {
              ...DEFAULT_LANES,
              ...parsed.lanes,
              fast: {
                modelId: resolvedFastModel.id,
                providerId: resolvedFastModel.provider,
              },
              deep: {
                modelId: resolvedDeepModel.id,
                providerId: resolvedDeepModel.provider,
              },
            },
          });
        }
      } catch {
        // Invalid storage, use defaults
      }

      setIsHydrated(true);
    };

    loadConfig();
  }, []);

  // Persist to localStorage on change (with async encryption)
  React.useEffect(() => {
    if (!isHydrated || typeof window === "undefined") {
      return;
    }

    const saveConfig = async () => {
      try {
        const encryptedProviders = await encryptProviderKeys(state);
        const toStore: ProviderConfigState = {
          ...state,
          providers: encryptedProviders,
        };

        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(toStore));
      } catch (error) {
        console.error("[ProviderConfig] Failed to save config:", error);
      }
    };

    saveConfig();
  }, [state, isHydrated]);

  const updateProvider = React.useCallback(
    (providerId: ProviderId, config: Partial<ProviderConfig>) => {
      setState((prev) => ({
        ...prev,
        providers: {
          ...prev.providers,
          [providerId]: {
            ...prev.providers[providerId],
            ...config,
          },
        },
      }));
    },
    []
  );

  const setActiveProvider = React.useCallback((providerId: ProviderId) => {
    setState((prev) => ({
      ...prev,
      activeProvider: providerId,
    }));
  }, []);

  const resetProvider = React.useCallback((providerId: ProviderId) => {
    setState((prev) => ({
      ...prev,
      providers: {
        ...prev.providers,
        [providerId]: createDefaultConfig(providerId),
      },
    }));
  }, []);

  const resetAll = React.useCallback(() => {
    setState(DEFAULT_STATE);
  }, []);

  const isProviderConfigured = React.useCallback(
    (providerId: ProviderId) => {
      const provider = state.providers[providerId];
      return provider.enabled && provider.apiKey.length > 0;
    },
    [state.providers]
  );

  const getConfiguredProviders = React.useCallback(() => {
    return (Object.keys(state.providers) as ProviderId[]).filter((id) => isProviderConfigured(id));
  }, [state.providers, isProviderConfigured]);

  const getDefaultBaseUrl = React.useCallback((providerId: ProviderId) => {
    return DEFAULT_BASE_URLS[providerId];
  }, []);

  const updateLane = React.useCallback((laneId: LaneId, config: LaneConfig) => {
    setState((prev) => ({
      ...prev,
      lanes: {
        ...prev.lanes,
        [laneId]: config,
      },
    }));
  }, []);

  const getLane = React.useCallback(
    (laneId: LaneId): LaneConfig => {
      return state.lanes[laneId] ?? DEFAULT_LANES[laneId];
    },
    [state.lanes]
  );

  const value = React.useMemo<ProviderConfigContextValue>(
    () => ({
      state,
      isHydrated,
      updateProvider,
      setActiveProvider,
      resetProvider,
      resetAll,
      isProviderConfigured,
      getConfiguredProviders,
      getDefaultBaseUrl,
      updateLane,
      getLane,
    }),
    [
      state,
      isHydrated,
      updateProvider,
      setActiveProvider,
      resetProvider,
      resetAll,
      isProviderConfigured,
      getConfiguredProviders,
      getDefaultBaseUrl,
      updateLane,
      getLane,
    ]
  );

  return <ProviderConfigContext.Provider value={value}>{children}</ProviderConfigContext.Provider>;
}

export function useProviderConfig() {
  const context = React.useContext(ProviderConfigContext);
  if (!context) {
    throw new Error("useProviderConfig must be used within a ProviderConfigProvider");
  }
  return context;
}

export { DEFAULT_BASE_URLS, DEFAULT_PROVIDER_NAMES, SUPPORTED_PROVIDER_IDS };
