import { describe, expect, it } from "vitest";
import { CostTrackerService } from "./CostTrackerService";

describe("CostTrackerService", () => {
  const service = new CostTrackerService();

  it("should calculate cost for known model", () => {
    // gemini-3-flash: input 0.1, output 0.4 (per 1M)
    // 1M input = $0.10
    // 1M output = $0.40
    const cost = service.calculateCost("gemini-3-flash", 1_000_000, 1_000_000);
    expect(cost).toBeCloseTo(0.5);
  });

  it("should calculate cost for small usage", () => {
    // 1000 input = 0.0001
    // 1000 output = 0.0004
    const cost = service.calculateCost("gemini-3-flash", 1000, 1000);
    expect(cost).toBeCloseTo(0.0005);
  });

  it("should return 0 for unknown model", () => {
    const cost = service.calculateCost("unknown-model-id", 1000, 1000);
    expect(cost).toBe(0);
  });

  it("should generate valid usage record", () => {
    const record = service.createUsageRecord(
      "session-1",
      "gemini-3-flash",
      "google",
      1000,
      1000,
      "msg-1"
    );

    expect(record).toMatchObject({
      sessionId: "session-1",
      modelId: "gemini-3-flash",
      providerId: "google",
      inputTokens: 1000,
      outputTokens: 1000,
      totalTokens: 2000,
      messageId: "msg-1",
    });
    expect(record.estimatedCostUsd).toBeCloseTo(0.0005);
    expect(record.timestamp).toBeDefined();
  });
});
