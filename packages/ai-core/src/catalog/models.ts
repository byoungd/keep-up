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
    contextWindow: 128_000,
    supports: { vision: true, tools: true, thinking: true },
    tags: ["quality"],
  },
  {
    id: "gpt-4o",
    label: "GPT-4o",
    shortLabel: "GPT-4o",
    description: "Legacy GPT-4o for compatibility.",
    provider: "openai",
    group: "GPT-4",
    contextWindow: 128_000,
    supports: { vision: true, tools: true, thinking: false },
    tags: ["legacy"],
    legacy: true,
  },
];

export function getModelCapability(modelId: string | undefined): ModelCapability | undefined {
  if (!modelId) {
    return undefined;
  }
  return MODEL_CATALOG.find((entry) => entry.id === modelId);
}

export function getDefaultModelId(): string {
  return MODEL_CATALOG.find((entry) => entry.default)?.id ?? MODEL_CATALOG[0]?.id ?? "";
}
