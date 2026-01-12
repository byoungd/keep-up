/**
 * LFCC v0.9 RC - Mark handling utilities
 * @see docs/product/LFCC_v0.9_RC_Engineering_Docs/10_Recursive_Canonicalization_Deep_Dive.md
 */

import type { CanonMark, CanonicalizerPolicyV2 } from "./types";

/** HTML tags that map to marks */
const TAG_TO_MARK: Record<string, CanonMark> = {
  b: "bold",
  strong: "bold",
  i: "italic",
  em: "italic",
  u: "underline",
  s: "strike",
  del: "strike",
  strike: "strike",
  code: "code",
  a: "link",
};

/**
 * Convert an HTML tag to a CanonMark if applicable
 */
export function tagToMark(tag: string): CanonMark | null {
  return TAG_TO_MARK[tag.toLowerCase()] ?? null;
}

/**
 * Check if a tag represents an inline mark
 */
export function isMarkTag(tag: string): boolean {
  return tag.toLowerCase() in TAG_TO_MARK;
}

/**
 * Sort marks according to policy mark_order
 * This ensures deterministic mark ordering regardless of input nesting
 */
export function sortMarks(marks: Set<CanonMark>, policy: CanonicalizerPolicyV2): CanonMark[] {
  const markArray = Array.from(marks);
  const orderMap = new Map(policy.mark_order.map((m, i) => [m, i]));

  return markArray.sort((a, b) => {
    const orderA = orderMap.get(a) ?? Number.POSITIVE_INFINITY;
    const orderB = orderMap.get(b) ?? Number.POSITIVE_INFINITY;
    return orderA - orderB;
  });
}

/**
 * Check if a mark is allowed by policy
 */
export function isMarkAllowed(mark: CanonMark, policy: CanonicalizerPolicyV2): boolean {
  return policy.mark_order.includes(mark);
}
