import type {
  WorkspaceApprovalDecision as CoreWorkspaceApprovalDecision,
  WorkspaceApprovalDecisionInput as CoreWorkspaceApprovalDecisionInput,
  WorkspaceApprovalKind as CoreWorkspaceApprovalKind,
  WorkspaceApprovalRequest as CoreWorkspaceApprovalRequest,
  WorkspaceApprovalRequestInput as CoreWorkspaceApprovalRequestInput,
  WorkspaceApprovalStatus as CoreWorkspaceApprovalStatus,
  WorkspaceSession as CoreWorkspaceSession,
  WorkspaceSessionConfig as CoreWorkspaceSessionConfig,
  WorkspaceSessionEvent as CoreWorkspaceSessionEvent,
  WorkspaceSessionEventType as CoreWorkspaceSessionEventType,
  WorkspaceSessionKind as CoreWorkspaceSessionKind,
  WorkspaceSessionSnapshot as CoreWorkspaceSessionSnapshot,
  WorkspaceSessionStatus as CoreWorkspaceSessionStatus,
} from "@ku0/agent-runtime-core";

export type WorkspaceKind = CoreWorkspaceSessionKind;
export type WorkspaceStatus = CoreWorkspaceSessionStatus;
export type WorkspaceEventType = CoreWorkspaceSessionEventType;
export type ApprovalKind = CoreWorkspaceApprovalKind;
export type ApprovalStatus = CoreWorkspaceApprovalStatus;
export type WorkspaceSessionConfig = CoreWorkspaceSessionConfig;
export type WorkspaceSession = CoreWorkspaceSession;
export type WorkspaceEvent = CoreWorkspaceSessionEvent;
export type WorkspaceSnapshot = CoreWorkspaceSessionSnapshot;
export type ApprovalRequestInput = CoreWorkspaceApprovalRequestInput;
export type ApprovalRequest = CoreWorkspaceApprovalRequest;
export type ApprovalDecisionInput = CoreWorkspaceApprovalDecisionInput;
export type ApprovalDecision = CoreWorkspaceApprovalDecision;

export type NativeWorkspaceSessionManager = {
  createSession: (config: WorkspaceSessionConfig) => WorkspaceSession;
  pauseSession: (sessionId: string) => void;
  resumeSession: (sessionId: string) => void;
  closeSession: (sessionId: string) => void;
  sendInput: (sessionId: string, payload: Record<string, unknown>) => void;
  drainEvents: (after?: number, limit?: number) => WorkspaceEvent[];
  listSessions: () => WorkspaceSession[];
  requestApproval: (request: ApprovalRequestInput) => ApprovalRequest;
  resolveApproval: (decision: ApprovalDecisionInput) => ApprovalDecision;
  getSnapshot: () => WorkspaceSnapshot;
  reset: () => void;
};

export type NativeWorkspaceSessionBinding = {
  WorkspaceSessionManager: new () => NativeWorkspaceSessionManager;
};
