import type { NativeTextNormalizationBinding } from "./types";

export type {
  CanonicalBlockInput,
  CanonicalHashResult,
  CanonicalResult,
  NativeTextNormalizationBinding,
} from "./types";

const browserError = new Error("Text normalization native bindings are not available in browser.");

export function getNativeTextNormalization(): NativeTextNormalizationBinding | null {
  return null;
}

export function getNativeTextNormalizationError(): Error | null {
  return browserError;
}
