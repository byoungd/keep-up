import { getDefaultModelId } from "@ku0/ai-core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createAIGateway } from "../gateway";

const ORIGINAL_ENV = { ...process.env };
const PROVIDER_ENV_KEYS = [
  "OPENAI_API_KEY",
  "AI_OPENAI_API_KEY",
  "OPENAI_BASE_URL",
  "ANTHROPIC_API_KEY",
  "ANTHROPIC_AUTH_TOKEN",
  "AI_CLAUDE_API_KEY",
  "ANTHROPIC_BASE_URL",
  "AI_DEFAULT_MODEL",
  "AI_GATEWAY_MODEL",
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

describe("createAIGateway", () => {
  beforeEach(() => {
    resetEnv();
    clearProviderEnv();
  });
  afterEach(resetEnv);

  it("throws when no providers are configured", () => {
    process.env.OPENAI_API_KEY = "";
    process.env.ANTHROPIC_API_KEY = "";
    process.env.AI_OPENAI_API_KEY = "";
    process.env.AI_CLAUDE_API_KEY = "";

    expect(() => createAIGateway()).toThrow("At least one AI provider must be configured");
  });

  it("uses catalog defaults when no model overrides are set", () => {
    process.env.OPENAI_API_KEY = "test-key";
    process.env.AI_DEFAULT_MODEL = "";
    process.env.AI_GATEWAY_MODEL = "";

    const gateway = createAIGateway();
    const config = (gateway as unknown as { config: { defaultModel?: string } }).config;

    expect(gateway.getProviders()).toContain("openai");
    expect(config.defaultModel).toBe(getDefaultModelId());

    gateway.shutdown();
  });

  it("prefers AI_DEFAULT_MODEL when provided", () => {
    process.env.OPENAI_API_KEY = "test-key";
    process.env.AI_DEFAULT_MODEL = "gpt-5.2-instant";

    const gateway = createAIGateway();
    const config = (gateway as unknown as { config: { defaultModel?: string } }).config;

    expect(config.defaultModel).toBe("gpt-5.2-instant");

    gateway.shutdown();
  });
});
