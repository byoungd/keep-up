import path from "node:path";
import { fileURLToPath } from "node:url";

import { loadNativeBinding } from "@ku0/native-bindings";
import { nativeFlagStore } from "@ku0/native-bindings/flags";
import type { NativeAnchorRelocationBinding } from "./types";

let cachedBinding: NativeAnchorRelocationBinding | null | undefined;
let cachedError: Error | null = null;

function readDisableFlag(value: string | undefined): boolean {
  if (!value) {
    return false;
  }
  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes";
}

function isNativeEnabled(): boolean {
  if (readDisableFlag(process.env.KU0_ANCHOR_RELOCATION_DISABLE_NATIVE)) {
    return false;
  }
  return nativeFlagStore.getFlag("native_accelerators_enabled");
}

function resolvePackageRoot(): string {
  const currentDir = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(currentDir, "..");
}

export function getNativeAnchorRelocation(): NativeAnchorRelocationBinding | null {
  if (!isNativeEnabled()) {
    return null;
  }

  if (cachedBinding !== undefined) {
    return cachedBinding;
  }

  const result = loadNativeBinding<NativeAnchorRelocationBinding>({
    packageRoot: resolvePackageRoot(),
    bindingNames: ["anchor_relocation_rs", "index"],
    envVar: "KU0_ANCHOR_RELOCATION_NATIVE_PATH",
    requiredExports: [
      "computeTextSimilarity",
      "findSubstringMatches",
      "findBlockMatches",
      "computeFuzzyContextHash",
      "computeNgramSimilarity",
    ],
    logTag: "Anchor relocation native binding",
  });

  cachedError = result.error;
  cachedBinding = result.binding;
  return cachedBinding;
}

export function getNativeAnchorRelocationError(): Error | null {
  return cachedError;
}

export type { NativeAnchorRelocationBinding } from "./types";
