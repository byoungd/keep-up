/**
 * LFCC Conformance Kit - Shrinker Tests
 */

import { describe, expect, it } from "vitest";
import { quickShrink, shrinkProgram } from "../op-fuzzer/shrinker";
import type { FuzzOp } from "../op-fuzzer/types";

describe("Shrinker", () => {
  describe("shrinkProgram", () => {
    it("should shrink to minimal failing program", async () => {
      // Create a program where only the 5th op causes failure
      const ops: FuzzOp[] = [
        { type: "InsertText", blockId: "b1", offset: 0, text: "a" },
        { type: "InsertText", blockId: "b1", offset: 1, text: "b" },
        { type: "InsertText", blockId: "b1", offset: 2, text: "c" },
        { type: "InsertText", blockId: "b1", offset: 3, text: "d" },
        { type: "InsertText", blockId: "b1", offset: 4, text: "FAIL" }, // This causes failure
        { type: "InsertText", blockId: "b1", offset: 5, text: "e" },
        { type: "InsertText", blockId: "b1", offset: 6, text: "f" },
      ];

      // Predicate: fails if any op has text "FAIL"
      const predicate = async (testOps: FuzzOp[]) => {
        return testOps.some((op) => op.type === "InsertText" && op.text === "FAIL");
      };

      const result = await shrinkProgram(ops, predicate);

      expect(result.originalLength).toBe(7);
      expect(result.shrunkLength).toBeLessThan(7);
      // Should contain the failing op
      expect(result.shrunkOps.some((op) => op.type === "InsertText" && op.text === "FAIL")).toBe(
        true
      );
    });

    it("should simplify operation parameters", async () => {
      const ops: FuzzOp[] = [
        {
          type: "InsertText",
          blockId: "b1",
          offset: 0,
          text: "This is a very long text that should be shortened",
        },
      ];

      // Predicate: fails if text contains "long"
      const predicate = async (testOps: FuzzOp[]) => {
        return testOps.some((op) => op.type === "InsertText" && op.text.includes("long"));
      };

      const result = await shrinkProgram(ops, predicate);

      // Text should be shortened but still contain "long"
      const shrunkOp = result.shrunkOps[0];
      expect(shrunkOp.type).toBe("InsertText");
      if (shrunkOp.type === "InsertText") {
        // biome-ignore lint/suspicious/noExplicitAny: test helper
        expect(shrunkOp.text.length).toBeLessThan((ops[0] as any).text.length);
        expect(shrunkOp.text).toContain("long");
      }
    });

    it("should handle empty result", async () => {
      const ops: FuzzOp[] = [{ type: "InsertText", blockId: "b1", offset: 0, text: "a" }];

      // Predicate: never fails
      const predicate = async () => false;

      const result = await shrinkProgram(ops, predicate);

      // Should return original since nothing fails
      expect(result.shrunkOps.length).toBe(1);
    });
  });

  describe("quickShrink", () => {
    it("should find minimum prefix that fails", async () => {
      const ops: FuzzOp[] = [
        { type: "InsertText", blockId: "b1", offset: 0, text: "a" },
        { type: "InsertText", blockId: "b1", offset: 1, text: "b" },
        { type: "InsertText", blockId: "b1", offset: 2, text: "FAIL" },
        { type: "InsertText", blockId: "b1", offset: 3, text: "c" },
        { type: "InsertText", blockId: "b1", offset: 4, text: "d" },
      ];

      // Predicate: fails if any op has text "FAIL"
      const predicate = async (testOps: FuzzOp[]) => {
        return testOps.some((op) => op.type === "InsertText" && op.text === "FAIL");
      };

      const result = await quickShrink(ops, predicate);

      // Should find minimum prefix containing "FAIL"
      expect(result.length).toBe(3);
      expect(result[2].type).toBe("InsertText");
      if (result[2].type === "InsertText") {
        expect(result[2].text).toBe("FAIL");
      }
    });
  });
});
