import path from "node:path";
import { fileURLToPath } from "node:url";

import { loadNativeBinding } from "@ku0/native-bindings";
import { nativeFlagStore } from "@ku0/native-bindings/flags";
import type { NativeAgentToolkitBinding } from "./types";

let cachedBinding: NativeAgentToolkitBinding | null | undefined;
let cachedError: Error | null = null;

function isNativeEnabled(): boolean {
  if (process.env.KU0_AGENT_TOOLKIT_DISABLE_NATIVE === "1") {
    return false;
  }
  return nativeFlagStore.getFlag("native_accelerators_enabled");
}

function resolvePackageRoot(): string {
  const currentDir = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(currentDir, "..");
}

export function getNativeAgentToolkit(): NativeAgentToolkitBinding | null {
  if (!isNativeEnabled()) {
    return null;
  }

  if (cachedBinding !== undefined) {
    return cachedBinding;
  }

  const result = loadNativeBinding<NativeAgentToolkitBinding>({
    packageRoot: resolvePackageRoot(),
    bindingNames: ["agent_toolkit_rs", "index"],
    envVar: "KU0_AGENT_TOOLKIT_NATIVE_PATH",
    requiredExports: ["AgentToolkitRegistry"],
    logTag: "Agent toolkit native binding",
  });

  cachedError = result.error;
  cachedBinding = result.binding;
  return cachedBinding;
}

export function getNativeAgentToolkitError(): Error | null {
  return cachedError;
}

export type { NativeAgentToolkitBinding } from "./types";
