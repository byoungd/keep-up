import { nativeFlagStore } from "@ku0/native-bindings/flags";
import { loadNativeBinding, resolvePackageRoot } from "@ku0/native-bindings/node";
import type { NativeWorkspaceSessionBinding } from "./types";

export type {
  ApprovalDecision,
  ApprovalDecisionInput,
  ApprovalKind,
  ApprovalRequest,
  ApprovalRequestInput,
  ApprovalStatus,
  NativeWorkspaceSessionBinding,
  NativeWorkspaceSessionManager,
  WorkspaceEvent,
  WorkspaceEventType,
  WorkspaceKind,
  WorkspaceSession,
  WorkspaceSessionConfig,
  WorkspaceSnapshot,
  WorkspaceStatus,
} from "./types";

let cachedBinding: NativeWorkspaceSessionBinding | null | undefined;
let cachedError: Error | null = null;

function isNativeEnabled(): boolean {
  if (process.env.KU0_WORKSPACE_SESSION_DISABLE_NATIVE === "1") {
    return false;
  }
  return nativeFlagStore.getFlag("native_accelerators_enabled");
}

export function getNativeWorkspaceSessionManager(): NativeWorkspaceSessionBinding | null {
  if (!isNativeEnabled()) {
    return null;
  }

  if (cachedBinding !== undefined) {
    return cachedBinding;
  }

  const result = loadNativeBinding<NativeWorkspaceSessionBinding>({
    packageRoot: resolvePackageRoot(import.meta.url),
    bindingNames: ["workspace_session_rs", "index"],
    envVar: "KU0_WORKSPACE_SESSION_NATIVE_PATH",
    requiredExports: ["WorkspaceSessionManager"],
    logTag: "Workspace session native binding",
  });

  cachedError = result.error;
  cachedBinding = result.binding;
  return cachedBinding ?? null;
}

export function getNativeWorkspaceSessionManagerError(): Error | null {
  return cachedError;
}
