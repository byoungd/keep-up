import { describe, expect, it } from "vitest";

import { anchorFromAbsolute } from "../../kernel/anchors";
import type { Annotation } from "../../kernel/types";
import {
  formatDisplayState,
  isUnverifiedDisplayState,
  isVerified,
  isVerifiedDisplayState,
} from "../verification";

const baseAnnotation: Annotation = {
  id: "ann_1",
  start: anchorFromAbsolute("b1", 0),
  end: anchorFromAbsolute("b1", 5),
  content: "Hello",
  storedState: "active",
  displayState: "active",
  createdAtMs: 0,
  verified: true,
};

describe("verification helpers", () => {
  it("flags verified display states", () => {
    expect(isVerifiedDisplayState("active")).toBe(true);
    expect(isVerifiedDisplayState("active_partial")).toBe(true);
    expect(isVerifiedDisplayState("active_unverified")).toBe(false);
  });

  it("flags unverified display states", () => {
    expect(isUnverifiedDisplayState("active")).toBe(false);
    expect(isUnverifiedDisplayState("active_unverified")).toBe(true);
  });

  it("formats display state labels", () => {
    expect(formatDisplayState("active_unverified")).toBe("Needs verification");
  });

  it("checks verification on annotations", () => {
    expect(isVerified(baseAnnotation)).toBe(true);
    expect(
      isVerified({
        ...baseAnnotation,
        displayState: "active_unverified",
        verified: false,
      })
    ).toBe(false);
  });
});
