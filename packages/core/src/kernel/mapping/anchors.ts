/**
 * LFCC v0.9 RC - Anchor encoding/decoding
 * @see docs/product/LFCC_v0.9_RC_Engineering_Docs/01_Kernel_API_Specification.md Section 3
 */

import { decodeAnchorV2, encodeAnchorV2 } from "../../anchors/codec";

/** Anchor data structure */
export type Anchor = {
  blockId: string;
  offset: number;
  bias: "before" | "after";
};

/**
 * Encode an absolute position to a base64 anchor string with integrity protection.
 * Uses the unified codec (HMAC-protected, versioned), with legacy decode support.
 */
export function anchorFromAbsolute(
  blockId: string,
  offset: number,
  bias: "before" | "after" = "after"
): string {
  const { base64 } = encodeAnchorV2({ blockId, offset, bias });
  return base64;
}

/**
 * Decode a base64 anchor string to absolute position.
 * Returns null if validation fails (fail-closed).
 */
export function absoluteFromAnchor(anchor: string): Anchor | null {
  return decodeAnchorV2(anchor);
}

/**
 * Create an anchor at a specific position
 */
export function createAnchor(
  blockId: string,
  offset: number,
  bias: "before" | "after" = "after"
): Anchor {
  return { blockId, offset, bias };
}

/**
 * Compare two anchors for ordering
 * Returns negative if a < b, positive if a > b, 0 if equal
 */
export function compareAnchors(a: Anchor, b: Anchor, blockOrder: string[]): number {
  const aIdx = blockOrder.indexOf(a.blockId);
  const bIdx = blockOrder.indexOf(b.blockId);

  if (aIdx !== bIdx) {
    return aIdx - bIdx;
  }

  if (a.offset !== b.offset) {
    return a.offset - b.offset;
  }

  // Same position - bias determines order
  if (a.bias === "before" && b.bias === "after") {
    return -1;
  }
  if (a.bias === "after" && b.bias === "before") {
    return 1;
  }
  return 0;
}
