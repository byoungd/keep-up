import type { NativePolicyHashBinding } from "./types";

export type { NativePolicyHashBinding } from "./types";

const browserError = new Error("Policy hash native bindings are not available in browser.");

export function getNativePolicyHash(): NativePolicyHashBinding | null {
  return null;
}

export function getNativePolicyHashError(): Error | null {
  return browserError;
}
