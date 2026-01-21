import type { NativeAnchorRelocationBinding } from "./types";

export type {
  BlockInput,
  BlockMatch,
  NativeAnchorRelocationBinding,
  SubstringMatch,
} from "./types";

const browserError = new Error("Anchor relocation native bindings are not available in browser.");

export function getNativeAnchorRelocation(): NativeAnchorRelocationBinding | null {
  return null;
}

export function getNativeAnchorRelocationError(): Error | null {
  return browserError;
}
