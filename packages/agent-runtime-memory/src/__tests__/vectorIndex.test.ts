/**
 * VectorIndex Tests
 */

import { describe, expect, it } from "vitest";
import { VectorIndex } from "../vectorIndex";

describe("VectorIndex", () => {
  it("returns top results sorted by score", () => {
    const index = new VectorIndex({ dimension: 2 });
    index.add("a", [1, 0]);
    index.add("b", [0, 1]);
    index.add("c", [0.8, 0.2]);

    const results = index.search([1, 0], { limit: 2 });

    expect(results.map((result) => result.id)).toEqual(["a", "c"]);
    expect(results[0].score).toBeGreaterThan(results[1].score);
  });

  it("respects thresholds and limit", () => {
    const index = new VectorIndex({ dimension: 2 });
    index.add("a", [1, 0]);
    index.add("b", [0.1, 0.9]);
    index.add("c", [0.8, 0.2]);

    const results = index.search([1, 0], { limit: 3, threshold: 0.9 });

    expect(results.map((result) => result.id)).toEqual(["a", "c"]);
  });

  it("returns empty results for non-positive limits", () => {
    const index = new VectorIndex({ dimension: 2 });
    index.add("a", [1, 0]);

    expect(index.search([1, 0], { limit: 0 })).toEqual([]);
  });
});
