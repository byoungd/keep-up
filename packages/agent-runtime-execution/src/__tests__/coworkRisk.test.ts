/**
 * Cowork Risk Scoring Tests
 */

import { describe, expect, it } from "vitest";
import { computeCoworkRiskScore, normalizeCoworkRiskTags } from "../cowork/risk";

describe("Cowork risk scoring", () => {
  it("normalizes tags and drops unknown values", () => {
    const tags = normalizeCoworkRiskTags(["delete", "unknown", "delete", "network"]);
    expect(tags).toEqual(["delete", "network"]);
  });

  it("sums risk weights and caps at 100", () => {
    const score = computeCoworkRiskScore(["delete", "overwrite", "network", "connector", "batch"]);
    expect(score).toBe(100);
  });

  it("forces 100 for denied decisions", () => {
    const score = computeCoworkRiskScore(["overwrite"], "deny");
    expect(score).toBe(100);
  });
});
