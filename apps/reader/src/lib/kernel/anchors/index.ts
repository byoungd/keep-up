import {
  type Anchor as CoreAnchor,
  absoluteFromAnchor as decodeAnchor,
  anchorFromAbsolute as encodeAnchor,
} from "@keepup/core";

export type Anchor = string;

export function anchorFromAbsolute(
  blockId: string,
  offset: number,
  bias: CoreAnchor["bias"] = "after"
): Anchor {
  return encodeAnchor(blockId, offset, bias);
}

export function absoluteFromAnchor(anchor: Anchor): CoreAnchor | null {
  return decodeAnchor(anchor);
}
