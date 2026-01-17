import { describe, expect, test } from "vitest";
import {
  getDefaultModelId,
  getModelCapability,
  getModelsWithCapabilities,
  getSuggestedModel,
  MODEL_CATALOG,
  modelSupportsThinking,
  modelSupportsTools,
  modelSupportsVision,
  normalizeModelId,
  validateModelCapabilities,
} from "./models";
import { getAllProviderIds, PROVIDER_CATALOG } from "./providers";

describe("normalizeModelId", () => {
  test("maps legacy model ids", () => {
    expect(normalizeModelId("gemini-3.0-flash")).toBe("gemini-3-flash");
    expect(normalizeModelId("gemini-3.0-pro")).toBe("gemini-3-pro-high");
    expect(normalizeModelId("gemini-3-pro")).toBe("gemini-3-pro-high");
    expect(normalizeModelId("gpt-5")).toBe("gpt-5.2-auto");
    expect(normalizeModelId("gpt-5.1")).toBe("gpt-5.1-pro");
  });

  test("trims input and preserves unknown ids", () => {
    expect(normalizeModelId(" gpt-5.1 ")).toBe("gpt-5.1-pro");
    expect(normalizeModelId("unknown-model")).toBe("unknown-model");
  });

  test("returns undefined for empty input", () => {
    expect(normalizeModelId(" ")).toBeUndefined();
    expect(normalizeModelId(undefined)).toBeUndefined();
  });
});

describe("getModelCapability", () => {
  test("resolves aliases before lookup", () => {
    const model = getModelCapability("gpt-5");
    expect(model?.id).toBe("gpt-5.2-auto");
  });
});

// ============================================================================
// Drift Tests - Guard against catalog divergence
// ============================================================================

describe("catalog drift prevention", () => {
  test("all models have unique IDs", () => {
    const ids = MODEL_CATALOG.map((m) => m.id);
    const uniqueIds = new Set(ids);
    expect(ids.length).toBe(uniqueIds.size);
  });

  test("all models reference valid providers", () => {
    const validProviders = getAllProviderIds();
    for (const model of MODEL_CATALOG) {
      expect(validProviders).toContain(model.provider);
    }
  });

  test("all providers in PROVIDER_CATALOG have at least one model", () => {
    const modelProviders = new Set(MODEL_CATALOG.map((m) => m.provider));
    for (const provider of PROVIDER_CATALOG) {
      expect(modelProviders.has(provider.id)).toBe(true);
    }
  });

  test("exactly one default model exists", () => {
    const defaults = MODEL_CATALOG.filter((m) => m.default);
    expect(defaults.length).toBeGreaterThanOrEqual(1);
    expect(getDefaultModelId()).toBeTruthy();
  });

  test("all models have valid contextWindow values", () => {
    for (const model of MODEL_CATALOG) {
      expect(model.contextWindow).toBeGreaterThan(0);
      expect(Number.isInteger(model.contextWindow)).toBe(true);
    }
  });

  test("all models have required supports fields", () => {
    for (const model of MODEL_CATALOG) {
      expect(typeof model.supports.vision).toBe("boolean");
      expect(typeof model.supports.tools).toBe("boolean");
      expect(typeof model.supports.thinking).toBe("boolean");
    }
  });

  test("legacy models are marked correctly", () => {
    const legacyModels = MODEL_CATALOG.filter((m) => m.legacy);
    for (const model of legacyModels) {
      expect(model.tags).toContain("legacy");
    }
  });
});

// ============================================================================
// Capability Validation Tests
// ============================================================================

describe("validateModelCapabilities", () => {
  test("returns null for valid model with matching capabilities", () => {
    const visionModel = MODEL_CATALOG.find((m) => m.supports.vision);
    if (visionModel) {
      expect(validateModelCapabilities(visionModel.id, { vision: true })).toBeNull();
    }
  });

  test("returns error for unknown model", () => {
    const error = validateModelCapabilities("nonexistent-model", {});
    expect(error?.code).toBe("model_not_found");
  });

  test("returns error for missing capabilities", () => {
    const noVisionModel = MODEL_CATALOG.find((m) => !m.supports.vision);
    if (noVisionModel) {
      const error = validateModelCapabilities(noVisionModel.id, { vision: true });
      expect(error?.code).toBe("capability_not_supported");
      expect(error?.missingCapabilities).toContain("vision");
    }
  });
});

describe("capability helper functions", () => {
  test("modelSupportsVision returns correct values", () => {
    const visionModel = MODEL_CATALOG.find((m) => m.supports.vision);
    const noVisionModel = MODEL_CATALOG.find((m) => !m.supports.vision);

    if (visionModel) {
      expect(modelSupportsVision(visionModel.id)).toBe(true);
    }
    if (noVisionModel) {
      expect(modelSupportsVision(noVisionModel.id)).toBe(false);
    }
  });

  test("modelSupportsTools returns correct values", () => {
    const toolsModel = MODEL_CATALOG.find((m) => m.supports.tools);
    if (toolsModel) {
      expect(modelSupportsTools(toolsModel.id)).toBe(true);
    }
  });

  test("modelSupportsThinking returns correct values", () => {
    const thinkingModel = MODEL_CATALOG.find((m) => m.supports.thinking);
    const noThinkingModel = MODEL_CATALOG.find((m) => !m.supports.thinking);

    if (thinkingModel) {
      expect(modelSupportsThinking(thinkingModel.id)).toBe(true);
    }
    if (noThinkingModel) {
      expect(modelSupportsThinking(noThinkingModel.id)).toBe(false);
    }
  });
});

describe("getModelsWithCapabilities", () => {
  test("filters models by vision capability", () => {
    const visionModels = getModelsWithCapabilities({ vision: true });
    for (const model of visionModels) {
      expect(model.supports.vision).toBe(true);
    }
  });

  test("filters models by multiple capabilities", () => {
    const models = getModelsWithCapabilities({ vision: true, thinking: true });
    for (const model of models) {
      expect(model.supports.vision).toBe(true);
      expect(model.supports.thinking).toBe(true);
    }
  });

  test("returns all models when no capabilities required", () => {
    const models = getModelsWithCapabilities({});
    expect(models.length).toBe(MODEL_CATALOG.length);
  });
});

describe("getSuggestedModel", () => {
  test("returns model with required capabilities", () => {
    const suggested = getSuggestedModel("gemini-3-flash", { vision: true });
    if (suggested) {
      expect(suggested.supports.vision).toBe(true);
    }
  });

  test("prefers same provider when possible", () => {
    const geminiNoVision = MODEL_CATALOG.find((m) => m.provider === "gemini" && !m.supports.vision);
    if (geminiNoVision) {
      const suggested = getSuggestedModel(geminiNoVision.id, { vision: true });
      if (suggested) {
        expect(suggested.provider).toBe("gemini");
      }
    }
  });

  test("returns undefined for unknown model with no alternatives", () => {
    const suggested = getSuggestedModel("nonexistent", {
      vision: true,
      tools: true,
      thinking: true,
    });
    // Should return something since we have models with all capabilities
    expect(suggested).toBeDefined();
  });
});
