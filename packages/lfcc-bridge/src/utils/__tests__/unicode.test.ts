import { describe, expect, test } from "vitest";
import { findSafePosition, isValidPosition, validateRange } from "../unicode";

describe("Surrogate Pair Validation", () => {
  test("validates position at start of surrogate pair", () => {
    const text = "Hello \uD83D\uDE00 World"; // "Hello 😀 World"
    // Position 6 is start of high surrogate
    expect(isValidPosition(text, 6)).toBe(true);
  });

  test("rejects position at middle of surrogate pair", () => {
    const text = "Hello \uD83D\uDE00 World";
    // Position 7 is low surrogate (second unit of pair)
    expect(isValidPosition(text, 7)).toBe(false);
  });

  test("validates range that includes complete surrogate pair", () => {
    const text = "Hello \uD83D\uDE00 World";
    // Range [6, 8) includes complete pair
    expect(validateRange(text, 6, 8).valid).toBe(true);
  });

  test("rejects range that splits surrogate pair", () => {
    const text = "Hello \uD83D\uDE00 World";
    // Range [6, 7) splits the pair
    expect(validateRange(text, 6, 7).valid).toBe(false);
  });
});

describe("Surrogate Pair Edge Cases", () => {
  test("handles orphaned high surrogate", () => {
    const text = "Hello \uD83D"; // High surrogate without low
    expect(isValidPosition(text, 6)).toBe(false);
  });

  test("handles orphaned low surrogate", () => {
    const text = "Hello \uDE00"; // Low surrogate without high
    expect(isValidPosition(text, 6)).toBe(false);
  });

  test("handles empty text", () => {
    expect(isValidPosition("", 0)).toBe(true);
  });

  test("handles text with only surrogate pairs", () => {
    const text = "\uD83D\uDE00\uD83D\uDE01"; // Two emoji
    expect(validateRange(text, 0, 4).valid).toBe(true);
  });
});

describe("Find Safe Position", () => {
  test("returns safe position unchanged", () => {
    const text = "abc";
    expect(findSafePosition(text, 1)).toBe(1);
  });

  test("corrects mid-pair position backwards (start of pair)", () => {
    const text = "\uD83D\uDE00"; // 😀
    // Pointing at low surrogate (index 1) -> should move to 0
    expect(findSafePosition(text, 1)).toBe(0);
  });

  test("corrects orphaned low surrogate forwards", () => {
    const text = "a\uDE00b";
    // Pointing at low surrogate (index 1) without high -> move to 2
    expect(findSafePosition(text, 1)).toBe(2);
  });
});
