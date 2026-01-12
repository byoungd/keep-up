/**
 * LFCC Conformance Kit - Harness Tests
 */

import { describe, expect, it } from "vitest";
import { MockAdapterFactory, type MockLoroAdapter, type MockShadowAdapter } from "../adapters/mock";
import { compareCanonTrees } from "../double-blind/comparator";
import { DoubleBlindHarness } from "../double-blind/harness";
import type { FuzzOp } from "../op-fuzzer/types";

describe("Double-Blind Harness", () => {
  describe("DoubleBlindHarness", () => {
    it("should pass when implementations match", async () => {
      const factory = new MockAdapterFactory();
      const loro = factory.createLoroAdapter();
      const shadow = factory.createShadowAdapter();
      const canonicalizer = factory.createCanonicalizerAdapter();

      // Setup identical initial state
      const loroMock = loro as MockLoroAdapter;
      const shadowMock = shadow as MockShadowAdapter;
      loroMock.addBlock("paragraph", "Hello");
      shadowMock.addBlock("paragraph", "Hello");

      const harness = new DoubleBlindHarness(loro, shadow, canonicalizer, {
        checkpointPolicy: "everyStep",
      });

      const ops: FuzzOp[] = [{ type: "InsertText", blockId: "block-0", offset: 5, text: " World" }];

      const result = await harness.run(42, ops);
      expect(result.passed).toBe(true);
      expect(result.completedSteps).toBe(1);
    });

    it("should detect mismatch when implementations differ", async () => {
      const factory = new MockAdapterFactory();
      const loro = factory.createLoroAdapter();
      const shadow = factory.createShadowAdapter();
      const canonicalizer = factory.createCanonicalizerAdapter();

      // Setup different initial state
      const loroMock = loro as MockLoroAdapter;
      const shadowMock = shadow as MockShadowAdapter;
      loroMock.addBlock("paragraph", "Hello");
      shadowMock.addBlock("paragraph", "Different");

      const harness = new DoubleBlindHarness(loro, shadow, canonicalizer, {
        checkpointPolicy: "everyStep",
      });

      const result = await harness.run(42, []);
      expect(result.passed).toBe(false);
      expect(result.firstMismatch).toBeDefined();
    });

    it("should respect checkpoint policy", async () => {
      const factory = new MockAdapterFactory();
      const loro = factory.createLoroAdapter();
      const shadow = factory.createShadowAdapter();
      const canonicalizer = factory.createCanonicalizerAdapter();

      const loroMock = loro as MockLoroAdapter;
      const shadowMock = shadow as MockShadowAdapter;
      loroMock.addBlock("paragraph", "Hello");
      shadowMock.addBlock("paragraph", "Hello");

      const harness = new DoubleBlindHarness(loro, shadow, canonicalizer, {
        checkpointPolicy: "everyN",
        checkpointInterval: 5,
      });

      const ops: FuzzOp[] = Array(10)
        .fill(null)
        .map((_, i) => ({
          type: "InsertText" as const,
          blockId: "block-0",
          offset: 5 + i,
          text: "x",
        }));

      const result = await harness.run(42, ops);

      // Count checkpointed steps
      const checkpointed = result.stepResults.filter((r) => r.checkpointed).length;
      expect(checkpointed).toBe(2); // Steps 4 and 9 (0-indexed, every 5th)
    });
  });

  describe("compareCanonTrees", () => {
    it("should detect equal trees", () => {
      const tree = {
        id: "doc",
        type: "doc",
        attrs: {},
        children: [
          {
            id: "p1",
            type: "paragraph",
            attrs: {},
            children: [{ text: "Hello", marks: [], is_leaf: true as const }],
          },
        ],
      };

      const result = compareCanonTrees(tree, tree, 0);
      expect(result.equal).toBe(true);
    });

    it("should detect type mismatch", () => {
      const tree1 = { id: "doc", type: "doc", attrs: {}, children: [] };
      const tree2 = { id: "p1", type: "paragraph", attrs: {}, children: [] };

      const result = compareCanonTrees(tree1, tree2, 0);
      expect(result.equal).toBe(false);
      expect(result.mismatch?.description).toContain("Type mismatch");
    });

    it("should detect text mismatch", () => {
      const tree1 = { text: "Hello", marks: [], is_leaf: true as const };
      const tree2 = { text: "World", marks: [], is_leaf: true as const };

      const result = compareCanonTrees(tree1, tree2, 0);
      expect(result.equal).toBe(false);
      expect(result.mismatch?.description).toContain("Text mismatch");
    });

    it("should detect children count mismatch", () => {
      const tree1 = {
        id: "doc",
        type: "doc",
        attrs: {},
        children: [{ id: "p1", type: "p", attrs: {}, children: [] }],
      };
      const tree2 = { id: "doc", type: "doc", attrs: {}, children: [] };

      const result = compareCanonTrees(tree1, tree2, 0);
      expect(result.equal).toBe(false);
      expect(result.mismatch?.description).toContain("Children count mismatch");
    });
  });
});
