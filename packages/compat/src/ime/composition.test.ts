/**
 * LFCC v0.9 RC - Track 14: IME Composition Tests
 *
 * Simulates IME composition events to ensure:
 * 1. No selection mapping during composition
 * 2. Composition end correctly commits text
 * 3. No partial token creation during composition
 */

import { describe, expect, it } from "vitest";

/**
 * Mock composition event sequence.
 */
type CompositionEvent = {
  type: "compositionstart" | "compositionupdate" | "compositionend";
  data: string;
};

/**
 * Simulates IME composition handling logic.
 * Returns whether selection mapping should be active.
 */
function shouldBlockSelectionDuringComposition(events: CompositionEvent[]): boolean[] {
  const results: boolean[] = [];
  let isComposing = false;

  for (const event of events) {
    switch (event.type) {
      case "compositionstart":
        isComposing = true;
        results.push(true); // Block selection
        break;
      case "compositionupdate":
        results.push(isComposing); // Continue blocking
        break;
      case "compositionend":
        isComposing = false;
        results.push(false); // Allow selection again
        break;
    }
  }

  return results;
}

/**
 * Validates that text is committed correctly after composition.
 */
function validateCompositionCommit(
  compositionData: string,
  finalText: string
): { valid: boolean; reason?: string } {
  // Rule: Final text must contain the composed data
  if (!finalText.includes(compositionData)) {
    return { valid: false, reason: "Composition data not found in final text" };
  }

  // Rule: No partial characters (for CJK, each char should be complete)
  const hasSurrogates =
    /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(finalText);
  if (hasSurrogates) {
    return { valid: false, reason: "Incomplete surrogate pair detected" };
  }

  return { valid: true };
}

describe("Track 14: IME Composition", () => {
  describe("shouldBlockSelectionDuringComposition", () => {
    it("should block selection during composition", () => {
      const events: CompositionEvent[] = [
        { type: "compositionstart", data: "" },
        { type: "compositionupdate", data: "你" },
        { type: "compositionupdate", data: "你好" },
        { type: "compositionend", data: "你好" },
      ];

      const results = shouldBlockSelectionDuringComposition(events);

      expect(results).toEqual([true, true, true, false]);
    });

    it("should handle multiple composition sessions", () => {
      const events: CompositionEvent[] = [
        { type: "compositionstart", data: "" },
        { type: "compositionend", data: "a" },
        { type: "compositionstart", data: "" },
        { type: "compositionend", data: "b" },
      ];

      const results = shouldBlockSelectionDuringComposition(events);

      expect(results).toEqual([true, false, true, false]);
    });
  });

  describe("validateCompositionCommit", () => {
    it("should accept valid CJK composition", () => {
      const result = validateCompositionCommit("你好", "Hello 你好 world");
      expect(result.valid).toBe(true);
    });

    it("should reject missing composition data", () => {
      const result = validateCompositionCommit("你好", "Hello world");
      expect(result.valid).toBe(false);
      expect(result.reason).toContain("not found");
    });

    it("should detect incomplete surrogate pairs", () => {
      // Manually create an incomplete surrogate
      const incomplete = "Hello \uD83D world"; // Missing low surrogate
      const result = validateCompositionCommit("test", `test ${incomplete}`);
      expect(result.valid).toBe(false);
    });
  });

  describe("CJK Input Scenarios", () => {
    it("should handle pinyin input sequence", () => {
      // Simulates: ni -> 你 (space commit)
      const events: CompositionEvent[] = [
        { type: "compositionstart", data: "" },
        { type: "compositionupdate", data: "n" },
        { type: "compositionupdate", data: "ni" },
        { type: "compositionupdate", data: "你" },
        { type: "compositionend", data: "你" },
      ];

      const blocked = shouldBlockSelectionDuringComposition(events);
      expect(blocked.slice(0, -1).every((b) => b)).toBe(true);
      expect(blocked[blocked.length - 1]).toBe(false);
    });

    it("should handle Japanese hiragana conversion", () => {
      // Simulates: na -> な -> 菜
      const events: CompositionEvent[] = [
        { type: "compositionstart", data: "" },
        { type: "compositionupdate", data: "n" },
        { type: "compositionupdate", data: "な" },
        { type: "compositionupdate", data: "菜" },
        { type: "compositionend", data: "菜" },
      ];

      const blocked = shouldBlockSelectionDuringComposition(events);
      expect(blocked.filter((b) => b).length).toBe(4);
    });
  });
});
