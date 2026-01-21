import path from "node:path";
import { fileURLToPath } from "node:url";

import { loadNativeBinding } from "@ku0/native-bindings";
import { nativeFlagStore } from "@ku0/native-bindings/flags";
import type { NativeAiContextHashBinding } from "./types";

let cachedBinding: NativeAiContextHashBinding | null | undefined;
let cachedError: Error | null = null;

function isNativeEnabled(): boolean {
  if (process.env.KU0_AI_CONTEXT_HASH_DISABLE_NATIVE === "1") {
    return false;
  }
  return nativeFlagStore.getFlag("native_accelerators_enabled");
}

function resolvePackageRoot(): string {
  const currentDir = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(currentDir, "..");
}

export function getNativeAiContextHash(): NativeAiContextHashBinding | null {
  if (!isNativeEnabled()) {
    return null;
  }

  if (cachedBinding !== undefined) {
    return cachedBinding;
  }

  const packageRoot = resolvePackageRoot();
  const result = loadNativeBinding<NativeAiContextHashBinding>({
    packageRoot,
    bindingNames: ["ai_context_hash_rs", "index"],
    envVar: "KU0_AI_CONTEXT_HASH_NATIVE_PATH",
    requiredExports: ["sha256Hex"],
    logTag: "AI context hash native binding",
  });

  cachedError = result.error;
  cachedBinding = result.binding;
  return cachedBinding;
}

export function getNativeAiContextHashError(): Error | null {
  return cachedError;
}

export type { NativeAiContextHashBinding } from "./types";
