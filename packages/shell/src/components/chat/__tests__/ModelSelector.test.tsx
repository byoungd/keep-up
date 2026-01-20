import type { ModelCapability } from "@ku0/ai-core";
import { describe, expect, it } from "vitest";
import { FEATURE_MASK, filterModelViews, type ModelView } from "../ModelSelector";

const MODELS: ModelCapability[] = [
  {
    id: "gpt-5.2-instant",
    label: "GPT-5.2 Instant",
    shortLabel: "GPT-5.2 Instant",
    description: "Fast responses for lightweight tasks.",
    provider: "openai",
    group: "GPT-5",
    contextWindow: 128_000,
    supports: { vision: false, tools: true, thinking: false },
    tags: ["fast"],
  },
  {
    id: "gemini-3-pro",
    label: "Gemini 3 Pro",
    shortLabel: "Gemini 3 Pro",
    description: "High-accuracy reasoning with vision.",
    provider: "gemini",
    group: "Gemini",
    contextWindow: 128_000,
    supports: { vision: true, tools: true, thinking: true },
    tags: ["quality", "vision"],
  },
  {
    id: "claude-4-5-sonnet",
    label: "Claude 4.5 Sonnet",
    shortLabel: "Claude 4.5 Sonnet",
    description: "Balanced Claude model for analysis.",
    provider: "claude",
    group: "Claude",
    contextWindow: 200_000,
    supports: { vision: true, tools: true, thinking: false },
    tags: ["balanced"],
  },
];

const VIEWS: ModelView[] = [
  {
    id: "gpt-5.2-instant",
    model: MODELS[0],
    providerLabel: "OpenAI",
    searchText: "gpt-5.2 instant openai fast",
    featureMask: 0,
    mainLabel: "GPT-5.2 Instant",
    suffixLabel: "",
    contextLabel: "128k",
  },
  {
    id: "gemini-3-pro",
    model: MODELS[1],
    providerLabel: "Google Gemini",
    searchText: "gemini 3 pro google gemini vision",
    featureMask: FEATURE_MASK.vision,
    mainLabel: "Gemini 3 Pro",
    suffixLabel: "",
    contextLabel: "128k",
  },
  {
    id: "claude-4-5-sonnet",
    model: MODELS[2],
    providerLabel: "Anthropic Claude",
    searchText: "claude 4.5 sonnet anthropic",
    featureMask: FEATURE_MASK.vision,
    mainLabel: "Claude 4.5 Sonnet",
    suffixLabel: "",
    contextLabel: "200k",
  },
];

describe("filterModelViews", () => {
  it("filters models by search tokens", () => {
    const result = filterModelViews({
      modelViews: VIEWS,
      activeProvider: "all",
      favoriteIds: new Set(),
      searchTokens: ["gemini"],
      activeFilterMask: 0,
      matchAllFilters: false,
    });

    expect(result.currentModels.map((item) => item.id)).toEqual(["gemini-3-pro"]);
  });

  it("filters models by provider and favorites", () => {
    const result = filterModelViews({
      modelViews: VIEWS,
      activeProvider: "favorites",
      favoriteIds: new Set(["claude-4-5-sonnet"]),
      searchTokens: [],
      activeFilterMask: 0,
      matchAllFilters: false,
    });

    expect(result.currentModels.map((item) => item.id)).toEqual(["claude-4-5-sonnet"]);
  });

  it("filters models by feature mask", () => {
    const result = filterModelViews({
      modelViews: VIEWS,
      activeProvider: "all",
      favoriteIds: new Set(),
      searchTokens: [],
      activeFilterMask: FEATURE_MASK.vision,
      matchAllFilters: false,
    });

    expect(result.currentModels.map((item) => item.id)).toEqual([
      "gemini-3-pro",
      "claude-4-5-sonnet",
    ]);
  });
});
