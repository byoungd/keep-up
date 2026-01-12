/**
 * LFCC v0.9 RC - Conformance Testing Module Tests
 */

import { describe, expect, it } from "vitest";
import type { CanonBlock } from "../canonicalizer";
import { addBlock, createShadowDocument } from "../shadow";
import {
  DEFAULT_FUZZ_CONFIG,
  GOLDEN_FIXTURES,
  checkConvergence,
  compareAgainstGolden,
  createGoldenFixture,
  createRng,
  createTestHarness,
  deserializeFixture,
  formatSECResult,
  generateOp,
  nextRandom,
  randomElement,
  randomInt,
  randomString,
  runFuzzIteration,
  runGoldenFixtureTests,
  runSECAssertion,
  selectOpType,
  serializeFixture,
} from "../testing";

describe("Testing Module - Generators", () => {
  describe("createRng", () => {
    it("should create RNG with seed", () => {
      const rng = createRng(12345);
      expect(rng.seed).toBe(12345);
    });
  });

  describe("nextRandom", () => {
    it("should generate deterministic values", () => {
      const rng1 = createRng(12345);
      const { value: v1, rng: rng2 } = nextRandom(rng1);
      const { value: v2 } = nextRandom(rng2);
      const rng3 = createRng(12345);
      const { value: v3, rng: rng4 } = nextRandom(rng3);
      const { value: v4 } = nextRandom(rng4);
      expect(v1).toBe(v3);
      expect(v2).toBe(v4);
    });
  });

  describe("randomInt", () => {
    it("should generate integers in range", () => {
      let rng = createRng(42);
      for (let i = 0; i < 50; i++) {
        const { value, rng: newRng } = randomInt(rng, 5, 10);
        expect(value).toBeGreaterThanOrEqual(5);
        expect(value).toBeLessThanOrEqual(10);
        rng = newRng;
      }
    });
  });

  describe("randomString", () => {
    it("should generate string of specified length", () => {
      const rng = createRng(42);
      const { value } = randomString(rng, 10);
      expect(value.length).toBe(10);
    });
  });

  describe("randomElement", () => {
    it("should select element from array", () => {
      const rng = createRng(42);
      const { value } = randomElement(rng, ["a", "b", "c"]);
      expect(["a", "b", "c"]).toContain(value);
    });

    it("should return undefined for empty array", () => {
      const rng = createRng(42);
      const { value } = randomElement(rng, []);
      expect(value).toBeUndefined();
    });
  });

  describe("selectOpType", () => {
    it("should select operation type based on weights", () => {
      const rng = createRng(42);
      const { type } = selectOpType(rng, DEFAULT_FUZZ_CONFIG.op_weights);
      expect(typeof type).toBe("string");
    });
  });

  describe("generateOp", () => {
    it("should generate operation for document", () => {
      const doc = createShadowDocument();
      const { doc: doc1 } = addBlock(
        doc,
        { type: "paragraph", attrs: {}, text: "Hello", parent_id: null, children_ids: [] },
        doc.root_id
      );
      const rng = createRng(42);
      const { op } = generateOp(rng, doc1, DEFAULT_FUZZ_CONFIG);
      expect(op).toBeDefined();
    });
  });
});

describe("Testing Module - Fuzz Framework", () => {
  describe("createTestHarness", () => {
    it("should create harness with specified replicas", () => {
      const config = { ...DEFAULT_FUZZ_CONFIG, replicas: 3 };
      const harness = createTestHarness(config);
      expect(harness.replicas.size).toBe(3);
    });
  });

  describe("checkConvergence", () => {
    it("should detect convergence when all replicas match", () => {
      const harness = createTestHarness(DEFAULT_FUZZ_CONFIG);
      const result = checkConvergence(harness);
      expect(result.converged).toBe(true);
    });
  });

  describe("runFuzzIteration", () => {
    it("should apply operations to replicas", () => {
      const config = { ...DEFAULT_FUZZ_CONFIG, ops_per_iteration: 5 };
      const harness = createTestHarness(config);
      const { ops_generated } = runFuzzIteration(harness, config);
      expect(ops_generated).toBeGreaterThan(0);
    });
  });

  describe("runSECAssertion", () => {
    it("should run SEC assertion", () => {
      const config = { ...DEFAULT_FUZZ_CONFIG, iterations: 3, ops_per_iteration: 5 };
      const result = runSECAssertion(config);
      expect(result.iterations_run).toBe(3);
    });

    it("should converge under long partition scenario", () => {
      const result = runSECAssertion({
        ...DEFAULT_FUZZ_CONFIG,
        iterations: 1,
        ops_per_iteration: 1,
        replicas: 3,
        scenario: "long-partition",
        max_drain_ticks: 2000,
      });
      expect(result.passed).toBe(true);
    });

    it("should converge under asymmetric drop scenario", () => {
      const result = runSECAssertion({
        ...DEFAULT_FUZZ_CONFIG,
        iterations: 1,
        ops_per_iteration: 1,
        replicas: 3,
        scenario: "asymmetric-drop",
        max_drain_ticks: 2000,
      });
      expect(result.passed).toBe(true);
    });

    it("should converge with deterministic split ids (seed regression)", () => {
      const result = runSECAssertion({
        ...DEFAULT_FUZZ_CONFIG,
        seed: 379509067,
        iterations: 1,
        ops_per_iteration: 4,
        replicas: 2,
        scenario: "baseline",
        max_drain_ticks: 500,
      });
      expect(result.passed).toBe(true);
    });
  });

  describe("formatSECResult", () => {
    it("should format result", () => {
      const result = {
        passed: true,
        iterations_run: 10,
        failures: [],
        seed: 12345,
        scenario: "baseline",
        network_stats: {
          queued: 0,
          delivered: 0,
          dropped: 0,
          duplicated: 0,
          delayed: 0,
          partition_blocked: 0,
        },
      };
      const formatted = formatSECResult(result);
      expect(formatted).toContain("PASSED");
    });
  });
});

describe("Testing Module - Golden Fixtures", () => {
  describe("createGoldenFixture", () => {
    it("should create fixture", () => {
      const canonical: CanonBlock = { id: "r/0", type: "paragraph", attrs: {}, children: [] };
      const fixture = createGoldenFixture("test", "desc", 42, [], canonical, ["b1"], {});
      expect(fixture.name).toBe("test");
      expect(fixture.seed).toBe(42);
    });
  });

  describe("serializeFixture / deserializeFixture", () => {
    it("should round-trip fixture", () => {
      const canonical: CanonBlock = { id: "r/0", type: "paragraph", attrs: {}, children: [] };
      const fixture = createGoldenFixture("roundtrip", "", 123, [], canonical, [], {});
      const json = serializeFixture(fixture);
      const restored = deserializeFixture(json);
      expect(restored.name).toBe("roundtrip");
    });
  });

  describe("compareAgainstGolden", () => {
    it("should pass when all match", () => {
      const canonical: CanonBlock = { id: "r/0", type: "paragraph", attrs: {}, children: [] };
      const fixture = createGoldenFixture("match", "", 1, [], canonical, [], {});
      const result = compareAgainstGolden(fixture, canonical, [], {});
      expect(result.passed).toBe(true);
    });

    it("should detect mismatch", () => {
      const expected: CanonBlock = {
        id: "r/0",
        type: "paragraph",
        attrs: {},
        children: [{ text: "A", marks: [], is_leaf: true }],
      };
      const actual: CanonBlock = {
        id: "r/0",
        type: "paragraph",
        attrs: {},
        children: [{ text: "B", marks: [], is_leaf: true }],
      };
      const fixture = createGoldenFixture("", "", 1, [], expected, [], {});
      const result = compareAgainstGolden(fixture, actual, [], {});
      expect(result.passed).toBe(false);
    });
  });

  describe("GOLDEN_FIXTURES", () => {
    it("should have predefined fixtures", () => {
      expect(GOLDEN_FIXTURES.length).toBeGreaterThan(0);
    });
  });

  describe("runGoldenFixtureTests", () => {
    it("should run fixtures", () => {
      const mockApply = () => ({
        canonical: GOLDEN_FIXTURES[0].expected_canonical as CanonBlock,
        blockIds: GOLDEN_FIXTURES[0].expected_block_ids,
        annotationStates: GOLDEN_FIXTURES[0].expected_annotation_states,
      });
      const results = runGoldenFixtureTests(mockApply);
      expect(results.passed + results.failed).toBe(GOLDEN_FIXTURES.length);
    });
  });
});

describe("Testing Module - DEFAULT_FUZZ_CONFIG", () => {
  it("should have valid configuration", () => {
    expect(DEFAULT_FUZZ_CONFIG.seed).toBeDefined();
    expect(DEFAULT_FUZZ_CONFIG.iterations).toBeGreaterThan(0);
    expect(DEFAULT_FUZZ_CONFIG.replicas).toBeGreaterThanOrEqual(2);
  });
});
