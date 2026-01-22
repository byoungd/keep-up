import type { NativeAnchorCodecBinding } from "./types";

export type { NativeAnchorCodecBinding } from "./types";

const browserError = new Error("Anchor codec native bindings are not available in browser.");

export function getNativeAnchorCodec(): NativeAnchorCodecBinding | null {
  return null;
}

export function getNativeAnchorCodecError(): Error | null {
  return browserError;
}
