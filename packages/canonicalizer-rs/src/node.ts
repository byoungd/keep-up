import path from "node:path";
import { fileURLToPath } from "node:url";

import { loadNativeBinding } from "@ku0/native-bindings";
import { nativeFlagStore } from "@ku0/native-bindings/flags";
import type { NativeCanonicalizerBinding } from "./types";

let cachedBinding: NativeCanonicalizerBinding | null | undefined;
let cachedError: Error | null = null;

function readDisableFlag(value: string | undefined): boolean {
  if (!value) {
    return false;
  }
  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes";
}

function isNativeEnabled(): boolean {
  if (readDisableFlag(process.env.KU0_CANONICALIZER_DISABLE_NATIVE)) {
    return false;
  }
  return nativeFlagStore.getFlag("native_accelerators_enabled");
}

function resolvePackageRoot(): string {
  const currentDir = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(currentDir, "..");
}

export function getNativeCanonicalizer(): NativeCanonicalizerBinding | null {
  if (!isNativeEnabled()) {
    return null;
  }

  if (cachedBinding !== undefined) {
    return cachedBinding;
  }

  const result = loadNativeBinding<NativeCanonicalizerBinding>({
    packageRoot: resolvePackageRoot(),
    bindingNames: ["canonicalizer_rs", "index"],
    envVar: "KU0_CANONICALIZER_NATIVE_PATH",
    requiredExports: ["canonicalizeDocument"],
    logTag: "Canonicalizer native binding",
  });

  cachedError = result.error;
  cachedBinding = result.binding;
  return cachedBinding;
}

export function getNativeCanonicalizerError(): Error | null {
  return cachedError;
}

export type { NativeCanonicalizerBinding } from "./types";
