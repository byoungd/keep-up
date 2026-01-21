import path from "node:path";
import { fileURLToPath } from "node:url";

import { loadNativeBinding } from "@ku0/native-bindings";
import { nativeFlagStore } from "@ku0/native-bindings/flags";
import type { NativeTextNormalizationBinding } from "./types";

let cachedBinding: NativeTextNormalizationBinding | null | undefined;
let cachedError: Error | null = null;

function isNativeEnabled(): boolean {
  if (process.env.KU0_TEXT_NORMALIZATION_DISABLE_NATIVE === "1") {
    return false;
  }
  return nativeFlagStore.getFlag("native_accelerators_enabled");
}

function resolvePackageRoot(): string {
  const currentDir = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(currentDir, "..");
}

export function getNativeTextNormalization(): NativeTextNormalizationBinding | null {
  if (!isNativeEnabled()) {
    return null;
  }

  if (cachedBinding !== undefined) {
    return cachedBinding;
  }

  const result = loadNativeBinding<NativeTextNormalizationBinding>({
    packageRoot: resolvePackageRoot(),
    bindingNames: ["text_normalization_rs", "index"],
    envVar: "KU0_TEXT_NORMALIZATION_NATIVE_PATH",
    requiredExports: ["canonicalizeText", "computeCanonicalHash"],
    logTag: "Text normalization native binding",
  });

  cachedError = result.error;
  cachedBinding = result.binding;
  return cachedBinding;
}

export function getNativeTextNormalizationError(): Error | null {
  return cachedError;
}

export type { NativeTextNormalizationBinding } from "./types";
