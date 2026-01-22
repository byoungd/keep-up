import path from "node:path";
import { fileURLToPath } from "node:url";

import { loadNativeBinding } from "@ku0/native-bindings";
import { nativeFlagStore } from "@ku0/native-bindings/flags";
import type { NativeAnchorCodecBinding } from "./types";

let cachedBinding: NativeAnchorCodecBinding | null | undefined;
let cachedError: Error | null = null;

function isNativeEnabled(): boolean {
  if (process.env.KU0_ANCHOR_CODEC_DISABLE_NATIVE === "1") {
    return false;
  }
  return nativeFlagStore.getFlag("native_accelerators_enabled");
}

function resolvePackageRoot(): string {
  const currentDir = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(currentDir, "..");
}

export function getNativeAnchorCodec(): NativeAnchorCodecBinding | null {
  if (!isNativeEnabled()) {
    return null;
  }

  if (cachedBinding !== undefined) {
    return cachedBinding;
  }

  const packageRoot = resolvePackageRoot();
  const result = loadNativeBinding<NativeAnchorCodecBinding>({
    packageRoot,
    bindingNames: ["anchor_codec_rs", "index"],
    envVar: "KU0_ANCHOR_CODEC_NATIVE_PATH",
    requiredExports: ["hmacSha256", "crc32", "verifyCrc32", "adler32"],
    logTag: "Anchor codec native binding",
  });

  cachedError = result.error;
  cachedBinding = result.binding;
  return cachedBinding;
}

export function getNativeAnchorCodecError(): Error | null {
  return cachedError;
}

export type { NativeAnchorCodecBinding } from "./types";
