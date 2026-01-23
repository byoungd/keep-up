import path from "node:path";
import { fileURLToPath } from "node:url";

import { loadNativeBinding } from "@ku0/native-bindings";
import { nativeFlagStore } from "@ku0/native-bindings/flags";
import type { NativeMarkdownContentBinding } from "./types";

let cachedBinding: NativeMarkdownContentBinding | null | undefined;
let cachedError: Error | null = null;

function isNativeEnabled(): boolean {
  if (process.env.KU0_MARKDOWN_CONTENT_DISABLE_NATIVE === "1") {
    return false;
  }
  return nativeFlagStore.getFlag("native_accelerators_enabled");
}

function resolvePackageRoot(): string {
  const currentDir = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(currentDir, "..");
}

export function getNativeMarkdownContent(): NativeMarkdownContentBinding | null {
  if (!isNativeEnabled()) {
    return null;
  }

  if (cachedBinding !== undefined) {
    return cachedBinding;
  }

  const result = loadNativeBinding<NativeMarkdownContentBinding>({
    packageRoot: resolvePackageRoot(),
    bindingNames: ["markdown_content_rs", "index"],
    envVar: "KU0_MARKDOWN_CONTENT_NATIVE_PATH",
    requiredExports: [
      "normalizeMarkdownText",
      "splitMarkdownLines",
      "computeMarkdownLineHash",
      "computeMarkdownContentHash",
      "buildMarkdownSemanticIndex",
      "resolveMarkdownSemanticTarget",
      "applyMarkdownLineOperations",
      "parseMarkdownBlocks",
    ],
    logTag: "Markdown content native binding",
  });

  cachedError = result.error;
  cachedBinding = result.binding;
  return cachedBinding;
}

export function getNativeMarkdownContentError(): Error | null {
  return cachedError;
}

export type { NativeMarkdownContentBinding } from "./types";
