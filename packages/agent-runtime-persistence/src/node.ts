import { nativeFlagStore } from "@ku0/native-bindings/flags";
import { loadNativeBinding, resolvePackageRoot } from "@ku0/native-bindings/node";
import type { NativePersistenceBinding } from "./persistence/types";

export type {
  NativePersistenceBinding,
  NativePersistenceStore,
  NativeTaskRunFilter,
  PersistenceStore,
} from "./persistence/types";

let cachedBinding: NativePersistenceBinding | null | undefined;
let cachedError: Error | null = null;

function isNativeEnabled(): boolean {
  if (process.env.KU0_PERSISTENCE_DISABLE_NATIVE === "1") {
    return false;
  }
  return nativeFlagStore.getFlag("native_accelerators_enabled");
}

export function getNativePersistenceStore(): NativePersistenceBinding | null {
  if (!isNativeEnabled()) {
    return null;
  }

  if (cachedBinding !== undefined) {
    return cachedBinding;
  }

  const result = loadNativeBinding<NativePersistenceBinding>({
    packageRoot: resolvePackageRoot(import.meta.url),
    bindingNames: ["persistence_store_rs", "persistence_store", "index"],
    envVar: "KU0_PERSISTENCE_NATIVE_PATH",
    requiredExports: ["PersistenceStore"],
    logTag: "Persistence store native binding",
  });

  cachedError = result.error;
  cachedBinding = result.binding;
  return cachedBinding ?? null;
}

export function getNativePersistenceStoreError(): Error | null {
  return cachedError;
}
