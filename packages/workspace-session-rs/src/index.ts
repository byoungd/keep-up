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

const browserError = new Error("Workspace session native bindings are not available in browser.");

export function getNativeWorkspaceSessionManager(): NativeWorkspaceSessionBinding | null {
  return null;
}

export function getNativeWorkspaceSessionManagerError(): Error | null {
  return browserError;
}
