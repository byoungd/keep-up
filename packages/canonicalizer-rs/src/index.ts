import type { NativeCanonicalizerBinding } from "./types";

export type {
  CanonBlock,
  CanonDiag,
  CanonInputNode,
  CanonicalizeDocumentInput,
  CanonicalizeResult,
  CanonicalizerPolicyV2,
  CanonMark,
  CanonNode,
  CanonText,
  NativeCanonicalizerBinding,
} from "./types";

const browserError = new Error("Canonicalizer native bindings are not available in browser.");

export function getNativeCanonicalizer(): NativeCanonicalizerBinding | null {
  return null;
}

export function getNativeCanonicalizerError(): Error | null {
  return browserError;
}
