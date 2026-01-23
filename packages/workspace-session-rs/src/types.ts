export type WorkspaceKind = "terminal" | "browser" | "file";

export type WorkspaceStatus = "created" | "active" | "paused" | "closed";

export type WorkspaceEventType =
  | "stdout"
  | "stderr"
  | "prompt"
  | "screenshot"
  | "dom_snapshot"
  | "file_view"
  | "log_line"
  | "status";

export type ApprovalKind = "tool" | "plan" | "escalation";

export type ApprovalStatus = "pending" | "approved" | "rejected" | "expired";

export type WorkspaceSessionConfig = {
  sessionId?: string;
  kind: WorkspaceKind;
  ownerAgentId?: string;
};

export type WorkspaceSession = {
  sessionId: string;
  kind: WorkspaceKind;
  status: WorkspaceStatus;
  ownerAgentId?: string;
  createdAt: number;
  updatedAt: number;
};

export type WorkspaceEvent = {
  sequence: number;
  sessionId: string;
  type: WorkspaceEventType;
  timestamp: number;
  payload: Record<string, unknown>;
};

export type WorkspaceSnapshot = {
  sessions: WorkspaceSession[];
  eventCursor: number;
};

export type ApprovalRequestInput = {
  requestId?: string;
  kind: ApprovalKind;
  payload: Record<string, unknown>;
  timeoutMs?: number;
};

export type ApprovalRequest = {
  requestId: string;
  kind: ApprovalKind;
  payload: Record<string, unknown>;
  requestedAt: number;
  timeoutMs?: number;
};

export type ApprovalDecisionInput = {
  requestId: string;
  status?: ApprovalStatus;
  approved?: boolean;
  reason?: string;
};

export type ApprovalDecision = {
  requestId: string;
  status: ApprovalStatus;
  approved: boolean;
  reason?: string;
};

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
