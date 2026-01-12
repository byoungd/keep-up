import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resolveProviderFromEnv } from "./providers";

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

describe("resolveProviderFromEnv", () => {
  beforeEach(() => {
    resetEnv();
    clearProviderEnv();
  });
  afterEach(resetEnv);

  it("returns null when API keys are missing", () => {
    process.env.OPENAI_API_KEY = "";
    process.env.AI_OPENAI_API_KEY = "";

    expect(resolveProviderFromEnv("openai")).toBeNull();
  });

  it("parses comma-separated API keys", () => {
    process.env.OPENAI_API_KEY = "key-1, key-2";

    const resolved = resolveProviderFromEnv("openai");

    expect(resolved?.apiKeys).toEqual(["key-1", "key-2"]);
  });

  it("normalizes Anthropic base URLs to include /v1", () => {
    process.env.ANTHROPIC_API_KEY = "key";
    process.env.ANTHROPIC_BASE_URL = "https://api.anthropic.com";

    const resolved = resolveProviderFromEnv("claude");

    expect(resolved?.baseUrl).toBe("https://api.anthropic.com/v1");
  });

  it("switches Gemini to OpenAI-compatible for non-Google base URLs", () => {
    process.env.GEMINI_API_KEY = "key";
    process.env.GEMINI_BASE_URL = "https://proxy.example.com/v1";

    const resolved = resolveProviderFromEnv("gemini");

    expect(resolved?.protocol).toBe("openai-compatible");
  });

  it("honors Gemini protocol overrides", () => {
    process.env.GEMINI_API_KEY = "key";
    process.env.AI_GEMINI_KIND = "gemini";

    const resolvedNative = resolveProviderFromEnv("gemini");

    expect(resolvedNative?.protocol).toBe("gemini");

    process.env.AI_GEMINI_KIND = "openai-compatible";

    const resolvedOpenAI = resolveProviderFromEnv("gemini");

    expect(resolvedOpenAI?.protocol).toBe("openai-compatible");
  });
});
