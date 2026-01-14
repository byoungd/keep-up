/**
 * LFCC v0.9 RC - DirtyInfo Enforcement Tests
 * @see docs/product/Audit/phase6/gaps/TASK_PROMPT_DIRTYINFO_ENFORCEMENT_BRIDGE.md D4
 */

import type { DirtyInfo } from "@ku0/core";
import { describe, expect, it } from "vitest";
import {
  type DirtyInfoDiff,
  assertDirtyInfoSuperset,
  formatDirtyInfoDiff,
} from "../dirty/assertDirtyInfo";

describe("assertDirtyInfoSuperset", () => {
  describe("D1: Superset Contract", () => {
    it("should pass when bridge is identical to kernel", () => {
      const info: DirtyInfo = {
        opCodes: ["OP_TEXT_EDIT"],
        touchedBlocks: ["block1", "block2"],
      };

      const result = assertDirtyInfoSuperset(info, info);
      expect(result.ok).toBe(true);
    });

    it("should pass when bridge is superset of kernel (more blocks)", () => {
      const kernel: DirtyInfo = {
        opCodes: ["OP_TEXT_EDIT"],
        touchedBlocks: ["block1"],
      };
      const bridge: DirtyInfo = {
        opCodes: ["OP_TEXT_EDIT"],
        touchedBlocks: ["block1", "block2", "block3"],
      };

      const result = assertDirtyInfoSuperset(kernel, bridge);
      expect(result.ok).toBe(true);
    });

    it("should pass when bridge is superset of kernel (more opCodes)", () => {
      const kernel: DirtyInfo = {
        opCodes: ["OP_TEXT_EDIT"],
        touchedBlocks: ["block1"],
      };
      const bridge: DirtyInfo = {
        opCodes: ["OP_TEXT_EDIT", "OP_MARK_EDIT"],
        touchedBlocks: ["block1"],
      };

      const result = assertDirtyInfoSuperset(kernel, bridge);
      expect(result.ok).toBe(true);
    });

    it("should fail when bridge is missing blocks (under-reporting)", () => {
      const kernel: DirtyInfo = {
        opCodes: ["OP_TEXT_EDIT"],
        touchedBlocks: ["block1", "block2"],
      };
      const bridge: DirtyInfo = {
        opCodes: ["OP_TEXT_EDIT"],
        touchedBlocks: ["block1"], // Missing block2
      };

      const result = assertDirtyInfoSuperset(kernel, bridge);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe("UNDER_REPORTED");
        expect(result.diff.missingBlocks).toContain("block2");
      }
    });

    it("should fail when bridge is missing opCodes", () => {
      const kernel: DirtyInfo = {
        opCodes: ["OP_TEXT_EDIT", "OP_BLOCK_SPLIT"],
        touchedBlocks: ["block1"],
      };
      const bridge: DirtyInfo = {
        opCodes: ["OP_TEXT_EDIT"], // Missing OP_BLOCK_SPLIT
        touchedBlocks: ["block1"],
      };

      const result = assertDirtyInfoSuperset(kernel, bridge);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.diff.missingOpCodes).toContain("OP_BLOCK_SPLIT");
      }
    });
  });

  describe("D4: Touched Ranges Validation", () => {
    it("should pass when bridge covers kernel ranges", () => {
      const kernel: DirtyInfo = {
        opCodes: ["OP_TEXT_EDIT"],
        touchedBlocks: ["block1"],
        touchedRanges: [{ blockId: "block1", start: 5, end: 10 }],
      };
      const bridge: DirtyInfo = {
        opCodes: ["OP_TEXT_EDIT"],
        touchedBlocks: ["block1"],
        touchedRanges: [{ blockId: "block1", start: 0, end: 20 }], // Covers 5-10
      };

      const result = assertDirtyInfoSuperset(kernel, bridge);
      expect(result.ok).toBe(true);
    });

    it("should fail when bridge range doesn't cover kernel range", () => {
      const kernel: DirtyInfo = {
        opCodes: ["OP_TEXT_EDIT"],
        touchedBlocks: ["block1"],
        touchedRanges: [{ blockId: "block1", start: 5, end: 15 }],
      };
      const bridge: DirtyInfo = {
        opCodes: ["OP_TEXT_EDIT"],
        touchedBlocks: ["block1"],
        touchedRanges: [{ blockId: "block1", start: 0, end: 10 }], // Doesn't cover 10-15
      };

      const result = assertDirtyInfoSuperset(kernel, bridge);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.diff.missingRanges).toHaveLength(1);
        expect(result.diff.missingRanges[0].blockId).toBe("block1");
      }
    });

    it("should fail when bridge has no ranges but kernel does", () => {
      const kernel: DirtyInfo = {
        opCodes: ["OP_TEXT_EDIT"],
        touchedBlocks: ["block1"],
        touchedRanges: [{ blockId: "block1", start: 5, end: 10 }],
      };
      const bridge: DirtyInfo = {
        opCodes: ["OP_TEXT_EDIT"],
        touchedBlocks: ["block1"],
        // No touchedRanges
      };

      const result = assertDirtyInfoSuperset(kernel, bridge);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.diff.missingRanges).toHaveLength(1);
      }
    });
  });

  describe("D4: Adversarial Tests", () => {
    it("should catch intentional shrinkage (adversarial)", () => {
      const kernel: DirtyInfo = {
        opCodes: ["OP_TEXT_EDIT", "OP_BLOCK_SPLIT", "OP_MARK_EDIT"],
        touchedBlocks: ["block1", "block2", "block3"],
        touchedRanges: [
          { blockId: "block1", start: 0, end: 50 },
          { blockId: "block2", start: 10, end: 20 },
        ],
      };

      // Adversarial bridge that shrinks everything
      const adversarialBridge: DirtyInfo = {
        opCodes: ["OP_TEXT_EDIT"], // Shrunk
        touchedBlocks: ["block1"], // Shrunk
        touchedRanges: [{ blockId: "block1", start: 20, end: 30 }], // Shrunk
      };

      const result = assertDirtyInfoSuperset(kernel, adversarialBridge);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.diff.missingBlocks.length).toBeGreaterThan(0);
        expect(result.diff.missingOpCodes.length).toBeGreaterThan(0);
        expect(result.diff.missingRanges.length).toBeGreaterThan(0);
      }
    });
  });
});

describe("formatDirtyInfoDiff", () => {
  it("should format diff with all fields", () => {
    const diff: DirtyInfoDiff = {
      missingBlocks: ["block2", "block3"],
      missingOpCodes: ["OP_BLOCK_SPLIT"],
      missingRanges: [{ blockId: "block1", start: 5, end: 10 }],
    };

    const formatted = formatDirtyInfoDiff(diff);
    expect(formatted).toContain("Missing blocks");
    expect(formatted).toContain("block2");
    expect(formatted).toContain("Missing opCodes");
    expect(formatted).toContain("OP_BLOCK_SPLIT");
    expect(formatted).toContain("Missing ranges");
    expect(formatted).toContain("block1[5:10]");
  });

  it("should return no differences for empty diff", () => {
    const diff: DirtyInfoDiff = {
      missingBlocks: [],
      missingOpCodes: [],
      missingRanges: [],
    };

    const formatted = formatDirtyInfoDiff(diff);
    expect(formatted).toBe("No differences");
  });
});
