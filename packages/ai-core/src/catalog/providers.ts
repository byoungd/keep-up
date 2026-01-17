/**
 * Provider Configuration Catalog
 *
 * Centralized provider metadata including environment variable mappings,
 * API endpoints, and display information. This is the single source of truth
 * for provider configuration across the entire application.
 */

import type { ProviderKind } from "./models";

// ============================================================================
// Types
// ============================================================================

/** Provider protocol/API type */
export type ProviderProtocol = "openai-compatible" | "anthropic" | "gemini";

/** Environment configuration for a provider */
export interface ProviderEnvConfig {
  /** Protocol/API type to use */
  protocol: ProviderProtocol;
  /** Environment variable names for API key (checked in order) */
  apiKeyEnvVars: string[];
  /** Environment variable names for base URL (checked in order) */
  baseUrlEnvVars?: string[];
  /** Default base URL if not specified via env */
  defaultBaseUrl?: string;
}

/** Display metadata for a provider */
export interface ProviderDisplayInfo {
  /** Human-readable name */
  name: string;
  /** Short label for compact UIs */
  shortName: string;
  /** Provider description */
  description?: string;
  /** Brand color (hex) */
  accentColor?: string;
  /** Icon identifier */
  icon?: string;
}

/** Complete provider metadata */
export interface ProviderMetadata {
  /** Provider identifier */
  id: ProviderKind;
  /** Environment configuration */
  env: ProviderEnvConfig;
  /** Display information */
  display: ProviderDisplayInfo;
}

// ============================================================================
// Provider Catalog
// ============================================================================

export const PROVIDER_CATALOG: ProviderMetadata[] = [
  {
    id: "gemini",
    env: {
      protocol: "gemini",
      apiKeyEnvVars: ["GEMINI_API_KEY", "AI_GEMINI_API_KEY"],
      baseUrlEnvVars: ["GEMINI_BASE_URL", "AI_GEMINI_BASE_URL"],
    },
    display: {
      name: "Google Gemini",
      shortName: "Gemini",
      description: "Google's multimodal AI models",
      accentColor: "#4285F4",
      icon: "gemini",
    },
  },
  {
    id: "claude",
    env: {
      protocol: "anthropic",
      apiKeyEnvVars: ["ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN", "AI_CLAUDE_API_KEY"],
      baseUrlEnvVars: ["ANTHROPIC_BASE_URL", "AI_CLAUDE_BASE_URL"],
      defaultBaseUrl: "https://api.anthropic.com/v1",
    },
    display: {
      name: "Anthropic Claude",
      shortName: "Claude",
      description: "Anthropic's helpful, harmless, and honest AI",
      accentColor: "#D4A574",
      icon: "anthropic",
    },
  },
  {
    id: "openai",
    env: {
      protocol: "openai-compatible",
      apiKeyEnvVars: ["OPENAI_API_KEY", "AI_OPENAI_API_KEY"],
      baseUrlEnvVars: ["OPENAI_BASE_URL", "AI_OPENAI_BASE_URL"],
      defaultBaseUrl: "https://api.openai.com/v1",
    },
    display: {
      name: "OpenAI",
      shortName: "OpenAI",
      description: "OpenAI GPT and O-series models",
      accentColor: "#10A37F",
      icon: "openai",
    },
  },
  {
    id: "deepseek",
    env: {
      protocol: "openai-compatible",
      apiKeyEnvVars: ["DEEPSEEK_API_KEY", "AI_DEEPSEEK_API_KEY"],
      baseUrlEnvVars: ["DEEPSEEK_BASE_URL", "AI_DEEPSEEK_BASE_URL"],
      defaultBaseUrl: "https://api.deepseek.com/v1",
    },
    display: {
      name: "DeepSeek",
      shortName: "DeepSeek",
      description: "Open-source models with strong coding abilities",
      accentColor: "#0066FF",
      icon: "deepseek",
    },
  },
  {
    id: "meta",
    env: {
      protocol: "openai-compatible",
      apiKeyEnvVars: ["META_API_KEY", "AI_META_API_KEY"],
      baseUrlEnvVars: ["META_BASE_URL", "AI_META_BASE_URL"],
    },
    display: {
      name: "Meta Llama",
      shortName: "Llama",
      description: "Meta's open foundation models",
      accentColor: "#0668E1",
      icon: "meta",
    },
  },
  {
    id: "alibaba",
    env: {
      protocol: "openai-compatible",
      apiKeyEnvVars: ["QWEN_API_KEY", "ALIBABA_API_KEY", "AI_ALIBABA_API_KEY"],
      baseUrlEnvVars: [
        "QWEN_API_ENDPOINT",
        "QWEN_BASE_URL",
        "ALIBABA_BASE_URL",
        "AI_ALIBABA_BASE_URL",
      ],
      defaultBaseUrl: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
    },
    display: {
      name: "Alibaba Qwen",
      shortName: "Qwen",
      description: "Alibaba's multimodal AI models",
      accentColor: "#FF6A00",
      icon: "alibaba",
    },
  },
  {
    id: "minimax",
    env: {
      protocol: "openai-compatible",
      apiKeyEnvVars: ["MINIMAX_API_KEY", "AI_MINIMAX_API_KEY"],
      baseUrlEnvVars: ["MINIMAX_BASE_URL", "AI_MINIMAX_BASE_URL"],
    },
    display: {
      name: "MiniMax",
      shortName: "MiniMax",
      description: "MiniMax MoE models with long context",
      accentColor: "#7B68EE",
      icon: "minimax",
    },
  },
  {
    id: "moonshot",
    env: {
      protocol: "openai-compatible",
      apiKeyEnvVars: ["MOONSHOT_API_KEY", "AI_MOONSHOT_API_KEY"],
      baseUrlEnvVars: ["MOONSHOT_BASE_URL", "AI_MOONSHOT_BASE_URL"],
      defaultBaseUrl: "https://api.moonshot.cn/v1",
    },
    display: {
      name: "Moonshot Kimi",
      shortName: "Kimi",
      description: "Moonshot AI's reasoning models",
      accentColor: "#6366F1",
      icon: "moonshot",
    },
  },
  {
    id: "xai",
    env: {
      protocol: "openai-compatible",
      apiKeyEnvVars: ["XAI_API_KEY", "AI_XAI_API_KEY"],
      baseUrlEnvVars: ["XAI_BASE_URL", "AI_XAI_BASE_URL"],
    },
    display: {
      name: "xAI Grok",
      shortName: "Grok",
      description: "xAI's models with real-time knowledge",
      accentColor: "#1DA1F2",
      icon: "xai",
    },
  },
  {
    id: "zai",
    env: {
      protocol: "openai-compatible",
      apiKeyEnvVars: ["ZAI_API_KEY", "ZHIPU_API_KEY", "AI_ZAI_API_KEY"],
      baseUrlEnvVars: ["ZAI_BASE_URL", "ZHIPU_BASE_URL", "AI_ZAI_BASE_URL"],
    },
    display: {
      name: "Zhipu GLM",
      shortName: "GLM",
      description: "Zhipu AI's foundation models",
      accentColor: "#00D4AA",
      icon: "zhipu",
    },
  },
  {
    id: "stealth",
    env: {
      protocol: "openai-compatible",
      apiKeyEnvVars: ["STEALTH_API_KEY", "AI_STEALTH_API_KEY"],
      baseUrlEnvVars: ["STEALTH_BASE_URL", "AI_STEALTH_BASE_URL"],
    },
    display: {
      name: "Stealth AI",
      shortName: "Stealth",
      description: "Enterprise-grade secure AI with no data retention",
      accentColor: "#1F2937",
      icon: "stealth",
    },
  },
  {
    id: "ollama",
    env: {
      protocol: "openai-compatible",
      apiKeyEnvVars: [], // Ollama requires no API key
      baseUrlEnvVars: ["OLLAMA_BASE_URL", "OLLAMA_HOST"],
      defaultBaseUrl: "http://localhost:11434/v1",
    },
    display: {
      name: "Ollama",
      shortName: "Ollama",
      description: "Local inference with open models",
      accentColor: "#FFFFFF",
      icon: "ollama",
    },
  },
];

// ============================================================================
// Lookup Functions
// ============================================================================

/** Get provider metadata by ID */
export function getProviderMetadata(providerId: ProviderKind): ProviderMetadata | undefined {
  return PROVIDER_CATALOG.find((p) => p.id === providerId);
}

/** Get provider environment config by ID */
export function getProviderEnvConfig(providerId: ProviderKind): ProviderEnvConfig | undefined {
  return getProviderMetadata(providerId)?.env;
}

/** Get provider display info by ID */
export function getProviderDisplayInfo(providerId: ProviderKind): ProviderDisplayInfo | undefined {
  return getProviderMetadata(providerId)?.display;
}

/** Get all provider IDs */
export function getAllProviderIds(): ProviderKind[] {
  return PROVIDER_CATALOG.map((p) => p.id);
}

/** Get providers by protocol */
export function getProvidersByProtocol(protocol: ProviderProtocol): ProviderMetadata[] {
  return PROVIDER_CATALOG.filter((p) => p.env.protocol === protocol);
}

// ============================================================================
// Environment Resolution Utilities
// ============================================================================

/** Get first non-empty value from environment variables */
export function getFirstEnvValue(keys: string[]): string | null {
  for (const key of keys) {
    const value = typeof process !== "undefined" ? process.env[key] : undefined;
    if (value && value.trim().length > 0) {
      return value.trim();
    }
  }
  return null;
}

/** Parse comma-separated API keys */
export function parseApiKeys(value: string | null): string[] {
  return value
    ? value
        .split(",")
        .map((entry) => entry.trim())
        .filter(Boolean)
    : [];
}

/** Normalize base URL (remove trailing slash) */
export function normalizeBaseUrl(value: string): string {
  return value.replace(/\/$/, "");
}

/** Normalize Anthropic base URL to ensure /v1 suffix */
export function normalizeAnthropicBaseUrl(value: string): string {
  const trimmed = normalizeBaseUrl(value);
  if (trimmed.endsWith("/v1/messages")) {
    return trimmed.replace(/\/messages$/, "");
  }
  return trimmed.endsWith("/v1") ? trimmed : `${trimmed}/v1`;
}

/** Check if URL is a Google API endpoint */
export function isGoogleBaseUrl(value: string): boolean {
  const normalized = value.toLowerCase();
  return (
    normalized.includes("generativelanguage.googleapis.com") ||
    normalized.includes("ai.google.dev") ||
    normalized.includes("googleapis.com")
  );
}

const resolveProviderBaseUrl = (env: ProviderEnvConfig): string | undefined => {
  const baseValue = env.baseUrlEnvVars ? getFirstEnvValue(env.baseUrlEnvVars) : null;
  const baseUrlRaw = baseValue ?? env.defaultBaseUrl ?? null;

  if (!baseUrlRaw || baseUrlRaw.trim().length === 0) {
    return undefined;
  }

  return env.protocol === "anthropic"
    ? normalizeAnthropicBaseUrl(baseUrlRaw)
    : normalizeBaseUrl(baseUrlRaw);
};

const resolveGeminiProtocol = (
  baseUrl: string | undefined,
  defaultProtocol: ProviderProtocol
): ProviderProtocol => {
  const forcedKind = getFirstEnvValue(["AI_GEMINI_KIND", "GEMINI_KIND", "AI_GEMINI_PROTOCOL"]);
  if (forcedKind === "openai-compatible") {
    return "openai-compatible";
  }
  if (forcedKind === "gemini" || forcedKind === "native") {
    return "gemini";
  }
  if (baseUrl && !isGoogleBaseUrl(baseUrl)) {
    // Non-Google endpoints default to OpenAI-compatible
    return "openai-compatible";
  }
  return defaultProtocol;
};

/** Resolve provider configuration from environment */
export function resolveProviderFromEnv(providerId: ProviderKind): {
  apiKeys: string[];
  baseUrl?: string;
  protocol: ProviderProtocol;
} | null {
  const metadata = getProviderMetadata(providerId);
  if (!metadata) {
    return null;
  }

  const { env } = metadata;
  const apiKeys = parseApiKeys(getFirstEnvValue(env.apiKeyEnvVars));

  if (apiKeys.length === 0) {
    return null;
  }

  const baseUrl = resolveProviderBaseUrl(env);
  const protocol =
    providerId === "gemini" ? resolveGeminiProtocol(baseUrl, env.protocol) : env.protocol;

  return { apiKeys, baseUrl, protocol };
}

/** Check if a provider is configured (has API keys) */
export function isProviderConfigured(providerId: ProviderKind): boolean {
  return resolveProviderFromEnv(providerId) !== null;
}

/** Get list of configured providers */
export function getConfiguredProviders(): ProviderKind[] {
  return getAllProviderIds().filter(isProviderConfigured);
}
