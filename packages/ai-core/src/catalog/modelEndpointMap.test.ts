import { describe, expect, it } from "vitest";
import type { ProviderKind } from "./models";
import { MODEL_CATALOG } from "./models";

// Simple mapping of provider kind to expected base path behavior
const PROVIDER_PATHS: Record<ProviderKind, { chatPath: string; isOpenAIStyle: boolean }> = {
  gemini: { chatPath: "/v1/chat/completions", isOpenAIStyle: true },
  claude: { chatPath: "/v1/messages", isOpenAIStyle: false },
  openai: { chatPath: "/v1/chat/completions", isOpenAIStyle: true },
  deepseek: { chatPath: "/v1/chat/completions", isOpenAIStyle: true },
  meta: { chatPath: "/v1/chat/completions", isOpenAIStyle: true },
  alibaba: { chatPath: "/v1/chat/completions", isOpenAIStyle: true },
  minimax: { chatPath: "/v1/chat/completions", isOpenAIStyle: true },
  moonshot: { chatPath: "/v1/chat/completions", isOpenAIStyle: true },
  xai: { chatPath: "/v1/chat/completions", isOpenAIStyle: true },
  zai: { chatPath: "/v1/chat/completions", isOpenAIStyle: true },
  stealth: { chatPath: "/v1/chat/completions", isOpenAIStyle: true },
};

describe("model endpoint mapping", () => {
  it("every model maps to a known provider path shape", () => {
    for (const model of MODEL_CATALOG) {
      const mapping = PROVIDER_PATHS[model.provider];
      expect(mapping, `missing mapping for provider ${model.provider}`).toBeDefined();
      expect(mapping.chatPath).toMatch(/^\/v1\//);
    }
  });

  it("gemini models use OpenAI-style chat/completions to align with proxy", () => {
    const geminiModels = MODEL_CATALOG.filter((m) => m.provider === "gemini");
    for (const model of geminiModels) {
      expect(PROVIDER_PATHS[model.provider].chatPath).toBe("/v1/chat/completions");
    }
  });
});
