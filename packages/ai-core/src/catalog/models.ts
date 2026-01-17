export type ProviderKind =
  | "gemini"
  | "claude"
  | "openai"
  | "deepseek"
  | "meta"
  | "alibaba"
  | "minimax"
  | "moonshot"
  | "xai"
  | "zai"
  | "stealth";

export type ModelPricing = {
  /** Price per 1 million input tokens in USD */
  inputTokensPer1M: number;
  /** Price per 1 million output tokens in USD */
  outputTokensPer1M: number;
};

export type ModelCapability = {
  id: string;
  label: string;
  shortLabel?: string;
  description?: string;
  provider: ProviderKind;
  group:
    | "Gemini"
    | "Claude"
    | "GPT-5"
    | "GPT-4"
    | "O3"
    | "DeepSeek"
    | "Llama 4"
    | "Llama 3"
    | "Qwen"
    | "MiniMax"
    | "Moonshot"
    | "Grok"
    | "Zhipu"
    | "Stealth";
  contextWindow: number;
  supports: {
    vision: boolean;
    tools: boolean;
    thinking: boolean;
  };
  tags: string[];
  pricing?: ModelPricing;
  default?: boolean;
  legacy?: boolean;
};

export const MODEL_CATALOG: ModelCapability[] = [
  // --- Google Gemini (Current) ---
  {
    id: "gemini-3-flash",
    label: "Gemini 3 Flash",
    shortLabel: "Gemini 3 Flash",
    description: "Lightning-fast responses with dependable quality for daily workflows.",
    provider: "gemini",
    group: "Gemini",
    contextWindow: 128_000,
    supports: { vision: false, tools: true, thinking: false },
    tags: ["fast"],
    pricing: { inputTokensPer1M: 0.1, outputTokensPer1M: 0.4 },
    default: true,
  },
  {
    id: "gemini-3-pro-high",
    label: "Gemini 3 Pro High",
    shortLabel: "Gemini 3 Pro High",
    description: "High-accuracy reasoning for complex analysis and long-form output.",
    provider: "gemini",
    group: "Gemini",
    contextWindow: 1_000_000,
    supports: { vision: true, tools: true, thinking: true },
    tags: ["quality", "thinking"],
    pricing: { inputTokensPer1M: 1.25, outputTokensPer1M: 5 },
  },
  {
    id: "gemini-3-pro-low",
    label: "Gemini 3 Pro Low",
    shortLabel: "Gemini 3 Pro Low",
    description: "Balanced reasoning with faster responses for daily use.",
    provider: "gemini",
    group: "Gemini",
    contextWindow: 1_000_000,
    supports: { vision: true, tools: true, thinking: false },
    tags: ["balanced", "fast"],
  },
  {
    id: "gemini-3-pro-image",
    label: "Gemini 3 Pro (Image)",
    shortLabel: "Gemini 3 Pro Image",
    description: "Image-capable generation for multimodal tasks.",
    provider: "gemini",
    group: "Gemini",
    contextWindow: 1_000_000,
    supports: { vision: true, tools: true, thinking: false },
    tags: ["vision", "multimodal"],
  },
  {
    id: "gemini-2.5-flash",
    label: "Gemini 2.5 Flash",
    shortLabel: "Gemini 2.5 Flash",
    description: "Quick turnarounds for lightweight tasks and rapid iteration.",
    provider: "gemini",
    group: "Gemini",
    contextWindow: 1_000_000,
    supports: { vision: false, tools: true, thinking: false },
    tags: ["fast"],
  },
  {
    id: "gemini-2.5-flash-lite",
    label: "Gemini 2.5 Flash Lite",
    shortLabel: "Gemini 2.5 Flash Lite",
    description: "Lowest-latency responses for ultra-fast interactions.",
    provider: "gemini",
    group: "Gemini",
    contextWindow: 1_000_000,
    supports: { vision: false, tools: true, thinking: false },
    tags: ["fast", "lite"],
  },
  {
    id: "gemini-2.5-pro",
    label: "Gemini 2.5 Pro",
    shortLabel: "Gemini 2.5 Pro",
    description: "Premium reasoning depth with consistent, high-fidelity answers.",
    provider: "gemini",
    group: "Gemini",
    contextWindow: 1_000_000,
    supports: { vision: true, tools: true, thinking: false },
    tags: ["balanced"],
  },
  {
    id: "gemini-2.5-flash-thinking",
    label: "Gemini 2.5 Flash (Thinking)",
    shortLabel: "Gemini 2.5 Flash Thinking",
    description: "Fast responses with lightweight chain-of-thought.",
    provider: "gemini",
    group: "Gemini",
    contextWindow: 1_000_000,
    supports: { vision: false, tools: true, thinking: true },
    tags: ["fast", "thinking"],
  },

  // --- Anthropic Claude (Current) ---
  {
    id: "claude-sonnet-4-5",
    label: "Claude 4.5 Sonnet",
    shortLabel: "Claude 4.5 Sonnet",
    description: "Balanced Claude model for high-quality reasoning and writing.",
    provider: "claude",
    group: "Claude",
    contextWindow: 200_000,
    supports: { vision: true, tools: true, thinking: false },
    tags: ["balanced"],
    pricing: { inputTokensPer1M: 3, outputTokensPer1M: 15 },
  },
  {
    id: "claude-opus-4-5",
    label: "Claude 4.5 Opus",
    shortLabel: "Claude 4.5 Opus",
    description: "Top-tier accuracy for demanding analysis and long contexts.",
    provider: "claude",
    group: "Claude",
    contextWindow: 200_000,
    supports: { vision: true, tools: true, thinking: true },
    tags: ["quality", "thinking"],
  },

  // --- OpenAI (Current) ---
  {
    id: "gpt-5.2-auto",
    label: "GPT-5.2",
    shortLabel: "GPT-5.2 Auto",
    description: "Adaptive reasoning that automatically balances speed and depth.",
    provider: "openai",
    group: "GPT-5",
    contextWindow: 128_000,
    supports: { vision: true, tools: true, thinking: true },
    tags: ["quality"],
    pricing: { inputTokensPer1M: 2.5, outputTokensPer1M: 10 },
    default: true,
  },
  {
    id: "gpt-5.2-instant",
    label: "GPT-5.2 Instant",
    shortLabel: "GPT-5.2 Instant",
    description: "Lightning-fast responses for immediate tasks.",
    provider: "openai",
    group: "GPT-5",
    contextWindow: 128_000,
    supports: { vision: true, tools: true, thinking: false },
    tags: ["fast", "balanced"],
  },
  {
    id: "gpt-5.2-thinking",
    label: "GPT-5.2 Thinking",
    shortLabel: "GPT-5.2 Thinking",
    description: "Extended deliberation for superior chain-of-thought quality.",
    provider: "openai",
    group: "GPT-5",
    contextWindow: 128_000,
    supports: { vision: true, tools: true, thinking: true },
    tags: ["quality", "thinking"],
  },
  {
    id: "gpt-5.2-pro",
    label: "GPT-5.2 Pro",
    shortLabel: "GPT-5.2 Pro",
    description: "Research-grade intelligence for the most complex challenges.",
    provider: "openai",
    group: "GPT-5",
    contextWindow: 200_000,
    supports: { vision: true, tools: true, thinking: true },
    tags: ["quality", "reasoning"],
  },
  {
    id: "gpt-5.0-mini",
    label: "GPT-5.0 Mini",
    shortLabel: "GPT-5.0 Mini",
    description: "Fast and efficient reasoning for everyday tasks.",
    provider: "openai",
    group: "GPT-5",
    contextWindow: 128_000,
    supports: { vision: true, tools: true, thinking: false },
    tags: ["fast", "balanced"],
  },
  {
    id: "o3-high",
    label: "o3-high",
    shortLabel: "o3 High",
    description: "Advanced reasoning model with extended deliberation capabilities.",
    provider: "openai",
    group: "O3",
    contextWindow: 200_000,
    supports: { vision: true, tools: true, thinking: true },
    tags: ["quality", "thinking"],
  },
  {
    id: "o3-mini",
    label: "o3-mini",
    shortLabel: "o3 Mini",
    description: "Cost-effective reasoning model for coding and logic.",
    provider: "openai",
    group: "O3",
    contextWindow: 200_000,
    supports: { vision: true, tools: true, thinking: true },
    tags: ["fast", "thinking"],
  },

  // --- DeepSeek (Current) ---
  {
    id: "deepseek-v3",
    label: "DeepSeek V3",
    shortLabel: "DeepSeek V3",
    description: "State-of-the-art open model with strong coding abilities.",
    provider: "deepseek",
    group: "DeepSeek",
    contextWindow: 128_000,
    supports: { vision: false, tools: true, thinking: false },
    tags: ["balanced", "coding"],
    pricing: { inputTokensPer1M: 0.14, outputTokensPer1M: 0.28 },
  },
  {
    id: "deepseek-r1",
    label: "DeepSeek R1",
    shortLabel: "DeepSeek R1",
    description: "Reasoning-specialized model for math and complex logic.",
    provider: "deepseek",
    group: "DeepSeek",
    contextWindow: 128_000,
    supports: { vision: false, tools: true, thinking: true },
    tags: ["quality", "thinking"],
  },

  // --- Meta Llama (Current) ---
  {
    id: "llama-4.0-400b",
    label: "Llama 4.0 (400B)",
    shortLabel: "Llama 4.0 400B",
    description: "Massive scale open foundation model for enterprise workloads.",
    provider: "meta",
    group: "Llama 4",
    contextWindow: 128_000,
    supports: { vision: true, tools: true, thinking: false },
    tags: ["quality"],
  },
  {
    id: "llama-4.0-70b",
    label: "Llama 4.0 (70B)",
    shortLabel: "Llama 4.0 70B",
    description: "The gold standard for efficient high-performance inference.",
    provider: "meta",
    group: "Llama 4",
    contextWindow: 128_000,
    supports: { vision: true, tools: true, thinking: false },
    tags: ["balanced"],
  },

  // --- Alibaba Qwen (Current) ---
  {
    id: "qwen-3.0-max",
    label: "Qwen 3.0 Max",
    shortLabel: "Qwen 3.0 Max",
    description: "Alibaba's flagship 1T+ parameter model for complex reasoning.",
    provider: "alibaba",
    group: "Qwen",
    contextWindow: 1_000_000,
    supports: { vision: true, tools: true, thinking: true },
    tags: ["quality", "reasoning"],
  },
  {
    id: "qwen-3.0-omni",
    label: "Qwen 3.0 Omni",
    shortLabel: "Qwen 3.0 Omni",
    description: "Multimodal expert for image, video, and audio analysis.",
    provider: "alibaba",
    group: "Qwen",
    contextWindow: 1_000_000,
    supports: { vision: true, tools: true, thinking: false },
    tags: ["balanced", "vision"],
  },

  // --- MiniMax (Current) ---
  {
    id: "abab-7",
    label: "Babibabab 7",
    shortLabel: "abab 7",
    description: "MiniMax's latest MoE model with high intelligence and extremely long context.",
    provider: "minimax",
    group: "MiniMax",
    contextWindow: 1_000_000,
    supports: { vision: false, tools: true, thinking: true },
    tags: ["quality", "thinking"],
  },

  // --- Moonshot AI (Current) ---
  {
    id: "kimi-k2-thinking",
    label: "Kimi K2 Thinking",
    shortLabel: "Kimi K2",
    description: "Advanced reasoning agent capable of self-directed tool chains.",
    provider: "moonshot",
    group: "Moonshot",
    contextWindow: 200_000,
    supports: { vision: true, tools: true, thinking: true },
    tags: ["quality", "thinking"],
  },
  {
    id: "kimi-k2",
    label: "Kimi K2 (10M)",
    shortLabel: "Kimi K2",
    description: "Massive context window specialist for analyzing entire repositories.",
    provider: "moonshot",
    group: "Moonshot",
    contextWindow: 10_000_000,
    supports: { vision: true, tools: true, thinking: false },
    tags: ["balanced"],
  },

  // --- xAI (Current) ---
  {
    id: "grok-4.0",
    label: "Grok 4.0",
    shortLabel: "Grok 4.0",
    description: "The most intelligent model with real-time world knowledge.",
    provider: "xai",
    group: "Grok",
    contextWindow: 1_000_000,
    supports: { vision: true, tools: true, thinking: true },
    tags: ["quality", "thinking"],
  },
  {
    id: "grok-3.5",
    label: "Grok 3.5",
    shortLabel: "Grok 3.5",
    description: "Legacy highly capable reasoning model.",
    provider: "xai",
    group: "Grok",
    contextWindow: 128_000,
    supports: { vision: true, tools: true, thinking: false },
    tags: ["legacy", "balanced"],
    legacy: true,
  },

  // --- Zhipu AI (Current) ---
  {
    id: "glm-5.0",
    label: "GLM-5.0",
    shortLabel: "GLM-5.0",
    description: "Next-gen AGI foundation model for complex real-world tasks.",
    provider: "zai",
    group: "Zhipu",
    contextWindow: 1_000_000,
    supports: { vision: true, tools: true, thinking: true },
    tags: ["quality"],
  },

  // --- Stealth (Current) ---
  {
    id: "stealth-pro-2",
    label: "Stealth Pro 2.0",
    shortLabel: "Stealth 2.0",
    description: "Enterprise-grade secure model with no data retention.",
    provider: "stealth",
    group: "Stealth",
    contextWindow: 128_000,
    supports: { vision: false, tools: true, thinking: false },
    tags: ["balanced"],
  },

  // --- Legacy Models ---
  {
    id: "gpt-5.1-pro",
    label: "GPT-5.1 Pro",
    shortLabel: "GPT-5.1 Pro",
    description: "Legacy research model.",
    provider: "openai",
    group: "GPT-5",
    contextWindow: 128_000,
    supports: { vision: true, tools: true, thinking: true },
    tags: ["legacy"],
    legacy: true,
  },
  {
    id: "gpt-5.1-thinking",
    label: "GPT-5.1 Thinking",
    shortLabel: "GPT-5.1 Thinking",
    description: "Legacy reasoning model.",
    provider: "openai",
    group: "GPT-5",
    contextWindow: 128_000,
    supports: { vision: true, tools: true, thinking: true },
    tags: ["legacy", "thinking"],
    legacy: true,
  },
  {
    id: "gpt-5.1-instant",
    label: "GPT-5.1 Instant",
    shortLabel: "GPT-5.1 Instant",
    description: "Legacy fast model.",
    provider: "openai",
    group: "GPT-5",
    contextWindow: 128_000,
    supports: { vision: true, tools: true, thinking: false },
    tags: ["legacy"],
    legacy: true,
  },
  {
    id: "gemini-1.5-pro",
    label: "Gemini 1.5 Pro",
    shortLabel: "Gemini 1.5 Pro",
    description: "Legacy high-performance model.",
    provider: "gemini",
    group: "Gemini",
    contextWindow: 1_000_000,
    supports: { vision: true, tools: true, thinking: false },
    tags: ["legacy"],
    legacy: true,
  },
  {
    id: "gemini-1.5-flash",
    label: "Gemini 1.5 Flash",
    shortLabel: "Gemini 1.5 Flash",
    description: "Legacy fast model.",
    provider: "gemini",
    group: "Gemini",
    contextWindow: 1_000_000,
    supports: { vision: true, tools: true, thinking: false },
    tags: ["legacy"],
    legacy: true,
  },
  {
    id: "claude-3-5-sonnet",
    label: "Claude 3.5 Sonnet",
    shortLabel: "Claude 3.5 Sonnet",
    description: "Legacy balanced model.",
    provider: "claude",
    group: "Claude",
    contextWindow: 200_000,
    supports: { vision: true, tools: true, thinking: false },
    tags: ["legacy"],
    legacy: true,
  },
  {
    id: "claude-3-opus",
    label: "Claude 3 Opus",
    shortLabel: "Claude 3 Opus",
    description: "Legacy foundation model.",
    provider: "claude",
    group: "Claude",
    contextWindow: 200_000,
    supports: { vision: true, tools: true, thinking: false },
    tags: ["legacy"],
    legacy: true,
  },
];

const MODEL_ALIASES: Record<string, string> = {
  "gemini-3.0-flash": "gemini-3-flash",
  "gemini-3.0-pro": "gemini-3-pro-high",
  "gemini-3-pro": "gemini-3-pro-high",
  "gpt-5": "gpt-5.2-auto",
  "gpt-5.1": "gpt-5.1-pro",
};

export function normalizeModelId(value?: string | null): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) {
    return undefined;
  }
  return MODEL_ALIASES[trimmed] ?? trimmed;
}

export function getModelCapability(modelId: string | undefined): ModelCapability | undefined {
  const normalized = normalizeModelId(modelId);
  if (!normalized) {
    return undefined;
  }
  return MODEL_CATALOG.find((entry) => entry.id === normalized);
}

export function getDefaultModelId(): string {
  return MODEL_CATALOG.find((entry) => entry.default)?.id ?? MODEL_CATALOG[0]?.id ?? "";
}

// ============================================================================
// Capability Validation
// ============================================================================

/** Required capabilities for a request */
export type RequiredCapabilities = {
  vision?: boolean;
  tools?: boolean;
  thinking?: boolean;
};

/** Capability validation error */
export type CapabilityError = {
  code: "model_not_found" | "capability_not_supported";
  message: string;
  modelId: string;
  missingCapabilities?: (keyof RequiredCapabilities)[];
};

/**
 * Validate that a model supports the required capabilities.
 * Returns null if valid, or an error describing what's missing.
 */
export function validateModelCapabilities(
  modelId: string,
  required: RequiredCapabilities
): CapabilityError | null {
  const capability = getModelCapability(modelId);

  if (!capability) {
    return {
      code: "model_not_found",
      message: `Model not found: ${modelId}`,
      modelId,
    };
  }

  const missing: (keyof RequiredCapabilities)[] = [];

  if (required.vision && !capability.supports.vision) {
    missing.push("vision");
  }
  if (required.tools && !capability.supports.tools) {
    missing.push("tools");
  }
  if (required.thinking && !capability.supports.thinking) {
    missing.push("thinking");
  }

  if (missing.length > 0) {
    return {
      code: "capability_not_supported",
      message: `Model ${modelId} does not support: ${missing.join(", ")}`,
      modelId,
      missingCapabilities: missing,
    };
  }

  return null;
}

/**
 * Check if a model supports vision (image/attachment analysis).
 */
export function modelSupportsVision(modelId: string): boolean {
  return getModelCapability(modelId)?.supports.vision ?? false;
}

/**
 * Check if a model supports tool/function calling.
 */
export function modelSupportsTools(modelId: string): boolean {
  return getModelCapability(modelId)?.supports.tools ?? false;
}

/**
 * Check if a model supports extended thinking/reasoning.
 */
export function modelSupportsThinking(modelId: string): boolean {
  return getModelCapability(modelId)?.supports.thinking ?? false;
}

/**
 * Get models that support specific capabilities.
 */
export function getModelsWithCapabilities(required: RequiredCapabilities): ModelCapability[] {
  return MODEL_CATALOG.filter((model) => {
    if (required.vision && !model.supports.vision) {
      return false;
    }
    if (required.tools && !model.supports.tools) {
      return false;
    }
    if (required.thinking && !model.supports.thinking) {
      return false;
    }
    return true;
  });
}

/**
 * Get a suggested alternative model when the requested one lacks capabilities.
 */
export function getSuggestedModel(
  currentModelId: string,
  required: RequiredCapabilities
): ModelCapability | undefined {
  const current = getModelCapability(currentModelId);
  if (!current) {
    // Return first model with required capabilities
    return getModelsWithCapabilities(required)[0];
  }

  // Prefer same provider, same group
  const alternatives = getModelsWithCapabilities(required);

  // Same provider, same group
  const sameProviderGroup = alternatives.find(
    (m) => m.provider === current.provider && m.group === current.group && !m.legacy
  );
  if (sameProviderGroup) {
    return sameProviderGroup;
  }

  // Same provider
  const sameProvider = alternatives.find((m) => m.provider === current.provider && !m.legacy);
  if (sameProvider) {
    return sameProvider;
  }

  // Any non-legacy
  return alternatives.find((m) => !m.legacy);
}
