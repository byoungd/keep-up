import type { NativeAiContextHashBinding } from "./types";

export type { NativeAiContextHashBinding } from "./types";

const browserError = new Error("AI context hash native bindings are not available in browser.");

export function getNativeAiContextHash(): NativeAiContextHashBinding | null {
  return null;
}

export function getNativeAiContextHashError(): Error | null {
  return browserError;
}
