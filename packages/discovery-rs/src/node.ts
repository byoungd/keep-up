import path from "node:path";
import { fileURLToPath } from "node:url";

import { loadNativeBinding } from "@ku0/native-bindings";
import { nativeFlagStore } from "@ku0/native-bindings/flags";
import type { NativeDiscoveryBinding } from "./types";

let cachedBinding: NativeDiscoveryBinding | null | undefined;
let cachedError: Error | null = null;

function isNativeEnabled(): boolean {
  if (process.env.KU0_DISCOVERY_DISABLE_NATIVE === "1") {
    return false;
  }
  return nativeFlagStore.getFlag("native_accelerators_enabled");
}

function resolvePackageRoot(): string {
  const currentDir = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(currentDir, "..");
}

export function getNativeDiscovery(): NativeDiscoveryBinding | null {
  if (!isNativeEnabled()) {
    return null;
  }

  if (cachedBinding !== undefined) {
    return cachedBinding;
  }

  const packageRoot = resolvePackageRoot();
  const result = loadNativeBinding<NativeDiscoveryBinding>({
    packageRoot,
    bindingNames: ["discovery_rs", "index"],
    envVar: "KU0_DISCOVERY_NATIVE_PATH",
    requiredExports: ["browseOnce", "startAdvertisement", "stopAdvertisement"],
    logTag: "Discovery native binding",
  });

  cachedError = result.error;
  cachedBinding = result.binding;
  return cachedBinding ?? null;
}

export function getNativeDiscoveryError(): Error | null {
  return cachedError;
}

export type { NativeDiscoveryBinding } from "./types";
