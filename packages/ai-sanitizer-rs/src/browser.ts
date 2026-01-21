import type { NativeAiSanitizer } from "./types";

export type {
  NativeAiSanitizer,
  SanitizationDiagnostic,
  SanitizationError,
  SanitizationLimits,
  SanitizationPolicy,
  SanitizedPayload,
  SanitizerInput,
} from "./types";

export function getNativeAiSanitizer(): NativeAiSanitizer | null {
  return null;
}

export function getNativeAiSanitizerError(): Error | null {
  return null;
}
