import { describe, expect, test } from "vitest";
import { getModelCapability, normalizeModelId } from "./models";

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
