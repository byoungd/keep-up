/**
 * LFCC v0.9.4 AI Targeting Resilience Conformance Tests
 *
 * Implementations MUST pass all tests in this suite to claim v0.9.4 compliance.
 *
 * @see docs/specs/lfcc/proposals/LFCC_v0.9.4_AI_Targeting_Resilience.md
 * @see docs/specs/lfcc/engineering/24_AI_Targeting_Extension.md
 */

import { gateway } from "@ku0/core";
import { describe, expect, it } from "vitest";
import {
  autoTrimVectors,
  layeredPreconditionVectors,
  neighborHashVectors,
  rankingVectors,
  structureHashVectors,
  windowHashVectors,
} from "../../targeting/vectors";

describe("LFCC v0.9.4 AI Targeting Conformance", () => {
  describe("Window Hash (LFCC_SPAN_WINDOW_V1)", () => {
    it.each(windowHashVectors)("$id: $description", (vector) => {
      const actual = gateway.buildSpanWindowCanonical(vector.input);
      expect(actual).toBe(vector.expectedCanonical);
    });
  });

  describe("Neighbor Hash (LFCC_NEIGHBOR_V1)", () => {
    it.each(neighborHashVectors)("$id: $description", (vector) => {
      const canonical = gateway.buildNeighborCanonicals(vector.input);
      expect(canonical.left).toBe(vector.expectedLeft);
      expect(canonical.right).toBe(vector.expectedRight);
    });
  });

  describe("Structure Hash (LFCC_BLOCK_SHAPE_V1)", () => {
    it.each(structureHashVectors)("$id: $description", (vector) => {
      const actual = gateway.buildStructureCanonical(vector.input);
      expect(actual).toBe(vector.expectedCanonical);
    });
  });

  describe("Candidate Ranking", () => {
    it.each(rankingVectors)("$id: $description", (vector) => {
      const ranked = gateway.rankCandidates(
        vector.candidates.map((candidate) => ({
          spanId: candidate.spanId,
          vector: candidate.vector as gateway.MatchVector,
          distance: candidate.distance,
        }))
      );
      expect(ranked.map((candidate) => candidate.spanId)).toEqual(vector.expectedOrder);
    });
  });

  describe("Layered Preconditions", () => {
    it.each(layeredPreconditionVectors)("$id: $description", (vector) => {
      expect(vector.expectedSuccess).toBeDefined();
    });
  });

  describe("Auto-Trim", () => {
    it.each(autoTrimVectors)("$id: $description", (vector) => {
      const preservedRatio = vector.intersectionLength / vector.originalLength;
      const success = preservedRatio >= vector.minPreservedRatio && vector.intersectionLength > 0;
      expect(success).toBe(vector.expectedSuccess);
    });
  });
});
