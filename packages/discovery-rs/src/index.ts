import type { NativeDiscoveryBinding } from "./types";

export type { DiscoveredService, DiscoveryProperty, NativeDiscoveryBinding } from "./types";

const browserError = new Error("Discovery native bindings are not available in browser.");

export function getNativeDiscovery(): NativeDiscoveryBinding | null {
  return null;
}

export function getNativeDiscoveryError(): Error | null {
  return browserError;
}
