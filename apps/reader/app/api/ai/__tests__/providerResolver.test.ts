import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resolveProviderTarget } from "../providerResolver";

const ORIGINAL_ENV = { ...process.env };
const PROVIDER_ENV_KEYS = [
  "OPENAI_API_KEY",
  "AI_OPENAI_API_KEY",
  "OPENAI_BASE_URL",
  "ANTHROPIC_API_KEY",
  "ANTHROPIC_AUTH_TOKEN",
  "AI_CLAUDE_API_KEY",
  "ANTHROPIC_BASE_URL",
  "GEMINI_API_KEY",
  "AI_GEMINI_API_KEY",
  "GEMINI_BASE_URL",
  "AI_GEMINI_KIND",
  "GEMINI_KIND",
  "AI_GEMINI_PROTOCOL",
  "DEEPSEEK_API_KEY",
  "AI_DEEPSEEK_API_KEY",
  "DEEPSEEK_BASE_URL",
  "META_API_KEY",
  "AI_META_API_KEY",
  "META_BASE_URL",
  "QWEN_API_KEY",
  "ALIBABA_API_KEY",
  "AI_ALIBABA_API_KEY",
  "QWEN_API_ENDPOINT",
  "QWEN_BASE_URL",
  "ALIBABA_BASE_URL",
  "AI_ALIBABA_BASE_URL",
  "MINIMAX_API_KEY",
  "AI_MINIMAX_API_KEY",
  "MINIMAX_BASE_URL",
  "MOONSHOT_API_KEY",
  "AI_MOONSHOT_API_KEY",
  "MOONSHOT_BASE_URL",
  "XAI_API_KEY",
  "AI_XAI_API_KEY",
  "XAI_BASE_URL",
  "ZAI_API_KEY",
  "ZHIPU_API_KEY",
  "AI_ZAI_API_KEY",
  "ZAI_BASE_URL",
  "ZHIPU_BASE_URL",
  "STEALTH_API_KEY",
  "AI_STEALTH_API_KEY",
  "STEALTH_BASE_URL",
];

const resetEnv = () => {
  for (const key of Object.keys(process.env)) {
    if (!(key in ORIGINAL_ENV)) {
      process.env[key] = "";
    }
  }
  for (const [key, value] of Object.entries(ORIGINAL_ENV)) {
    process.env[key] = value ?? "";
  }
};

const clearProviderEnv = () => {
  for (const key of PROVIDER_ENV_KEYS) {
    process.env[key] = "";
  }
};

describe("resolveProviderTarget", () => {
  beforeEach(() => {
    resetEnv();
    clearProviderEnv();
  });
  afterEach(resetEnv);

  it("falls back to the first configured provider when default model is unavailable", () => {
    process.env.ANTHROPIC_API_KEY = "test-key";

    const result = resolveProviderTarget({
      defaultModelId: "gpt-5.2-auto",
    });

    expect(result.target?.provider).toBe("claude");
    expect(result.target?.config.kind).toBe("anthropic");
    expect(result.target?.modelId).toBe("claude-sonnet-4-5");
  });

  it("returns provider_not_configured for explicit models without configured keys", () => {
    const result = resolveProviderTarget({
      requestedModel: "gpt-5.2-auto",
      defaultModelId: "gpt-5.2-auto",
    });

    expect(result.error?.code).toBe("provider_not_configured");
  });
});
