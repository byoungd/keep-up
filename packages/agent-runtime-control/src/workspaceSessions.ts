import type {
  ApprovalDecision,
  ApprovalDecisionInput,
  ApprovalRequest,
  ApprovalRequestInput,
  ApprovalStatus,
  WorkspaceEvent,
  WorkspaceEventType,
  WorkspaceSession,
  WorkspaceSessionConfig,
  WorkspaceSnapshot,
} from "@ku0/workspace-session-rs";
import {
  getNativeWorkspaceSessionManager,
  type NativeWorkspaceSessionManager,
} from "@ku0/workspace-session-rs/node";

export type {
  ApprovalDecision,
  ApprovalDecisionInput,
  ApprovalRequest,
  ApprovalRequestInput,
  ApprovalStatus,
  WorkspaceEvent,
  WorkspaceEventType,
  WorkspaceSession,
  WorkspaceSessionConfig,
  WorkspaceSnapshot,
} from "@ku0/workspace-session-rs";

const STATUS_EVENT_TYPE: WorkspaceEventType = "status";
const PROMPT_EVENT_TYPE: WorkspaceEventType = "prompt";

class InMemoryWorkspaceSessionManager implements NativeWorkspaceSessionManager {
  private sessions = new Map<string, WorkspaceSession>();
  private events: WorkspaceEvent[] = [];
  private approvals = new Map<string, { status: ApprovalStatus; expiresAt?: number }>();
  private pendingApprovals = 0;
  private nextSession = 1;
  private nextApproval = 1;
  private nextSequence = 1;

  createSession(config: WorkspaceSessionConfig): WorkspaceSession {
    const sessionId = config.sessionId ?? `ws-${this.nextSession++}`;
    if (this.sessions.has(sessionId)) {
      throw new Error("Workspace session already exists");
    }
    const now = Date.now();
    const session: WorkspaceSession = {
      sessionId,
      kind: config.kind,
      status: "created",
      ownerAgentId: config.ownerAgentId,
      createdAt: now,
      updatedAt: now,
    };
    this.sessions.set(sessionId, session);
    this.updateStatus(sessionId, "active");
    return session;
  }

  pauseSession(sessionId: string): void {
    this.updateStatus(sessionId, "paused");
  }

  resumeSession(sessionId: string): void {
    this.updateStatus(sessionId, "active");
  }

  closeSession(sessionId: string): void {
    this.updateStatus(sessionId, "closed");
  }

  sendInput(sessionId: string, payload: Record<string, unknown>): void {
    this.expireApprovals();
    if (this.pendingApprovals > 0) {
      throw new Error("Workspace sessions are blocked pending approval");
    }
    const session = this.getSession(sessionId);
    if (session.status === "closed") {
      throw new Error("Workspace session is closed");
    }
    this.appendEvent(sessionId, PROMPT_EVENT_TYPE, payload);
  }

  drainEvents(after?: number, limit?: number): WorkspaceEvent[] {
    const output: WorkspaceEvent[] = [];
    for (const event of this.events) {
      if (after !== undefined && event.sequence <= after) {
        continue;
      }
      output.push(event);
      if (limit !== undefined && output.length >= limit) {
        break;
      }
    }
    return output;
  }

  listSessions(): WorkspaceSession[] {
    return Array.from(this.sessions.values()).sort((a, b) => a.createdAt - b.createdAt);
  }

  requestApproval(request: ApprovalRequestInput): ApprovalRequest {
    const requestId = request.requestId ?? `approval-${this.nextApproval++}`;
    if (this.approvals.has(requestId)) {
      throw new Error("Approval request already exists");
    }

    const now = Date.now();
    const expiresAt = request.timeoutMs ? now + request.timeoutMs : undefined;
    const approval: ApprovalRequest = {
      requestId,
      kind: request.kind,
      payload: request.payload,
      requestedAt: now,
      timeoutMs: request.timeoutMs,
    };

    this.approvals.set(requestId, { status: "pending", expiresAt });
    this.pendingApprovals += 1;
    return approval;
  }

  resolveApproval(decision: ApprovalDecisionInput): ApprovalDecision {
    const record = this.approvals.get(decision.requestId);
    if (!record) {
      throw new Error("Approval request not found");
    }

    const now = Date.now();
    if (record.expiresAt && record.expiresAt <= now) {
      this.approvals.delete(decision.requestId);
      if (record.status === "pending" && this.pendingApprovals > 0) {
        this.pendingApprovals -= 1;
      }
      return {
        requestId: decision.requestId,
        status: "expired",
        approved: false,
        reason: decision.reason ?? "Approval timed out",
      };
    }

    const status = resolveApprovalStatus(decision);
    const approved = decision.approved ?? status === "approved";
    this.approvals.delete(decision.requestId);
    if (record.status === "pending" && this.pendingApprovals > 0) {
      this.pendingApprovals -= 1;
    }

    return {
      requestId: decision.requestId,
      status,
      approved,
      reason: decision.reason,
    };
  }

  getSnapshot(): WorkspaceSnapshot {
    return {
      sessions: this.listSessions(),
      eventCursor: this.nextSequence - 1,
    };
  }

  reset(): void {
    this.sessions = new Map();
    this.events = [];
    this.approvals = new Map();
    this.pendingApprovals = 0;
    this.nextSession = 1;
    this.nextApproval = 1;
    this.nextSequence = 1;
  }

  private updateStatus(sessionId: string, status: WorkspaceSession["status"]): void {
    const session = this.getSession(sessionId);
    const updated: WorkspaceSession = {
      ...session,
      status,
      updatedAt: Date.now(),
    };
    this.sessions.set(sessionId, updated);
    this.appendEvent(sessionId, STATUS_EVENT_TYPE, { status });
  }

  private appendEvent(
    sessionId: string,
    type: WorkspaceEventType,
    payload: Record<string, unknown>
  ): void {
    const event: WorkspaceEvent = {
      sequence: this.nextSequence,
      sessionId,
      type,
      timestamp: Date.now(),
      payload: normalizePayload(payload),
    };
    this.nextSequence += 1;
    this.events.push(event);
  }

  private getSession(sessionId: string): WorkspaceSession {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error("Workspace session not found");
    }
    return session;
  }

  private expireApprovals(now = Date.now()): void {
    for (const [requestId, record] of this.approvals.entries()) {
      if (record.status !== "pending" || !record.expiresAt) {
        continue;
      }
      if (record.expiresAt > now) {
        continue;
      }
      this.approvals.delete(requestId);
      if (this.pendingApprovals > 0) {
        this.pendingApprovals -= 1;
      }
    }
  }
}

function normalizePayload(payload: Record<string, unknown>): Record<string, unknown> {
  if (payload && typeof payload === "object" && !Array.isArray(payload)) {
    return payload;
  }
  return { value: payload };
}

function resolveApprovalStatus(decision: ApprovalDecisionInput): ApprovalStatus {
  if (decision.status) {
    if (decision.status === "pending") {
      throw new Error("Approval decision cannot be pending");
    }
    return decision.status;
  }
  if (decision.approved !== undefined) {
    return decision.approved ? "approved" : "rejected";
  }
  throw new Error("Approval decision requires status or approved");
}

export class WorkspaceSessionManager {
  private readonly manager: NativeWorkspaceSessionManager;

  constructor() {
    const binding = getNativeWorkspaceSessionManager();
    this.manager = binding
      ? new binding.WorkspaceSessionManager()
      : new InMemoryWorkspaceSessionManager();
  }

  createSession(config: WorkspaceSessionConfig): WorkspaceSession {
    return this.manager.createSession(config);
  }

  pauseSession(sessionId: string): void {
    this.manager.pauseSession(sessionId);
  }

  resumeSession(sessionId: string): void {
    this.manager.resumeSession(sessionId);
  }

  closeSession(sessionId: string): void {
    this.manager.closeSession(sessionId);
  }

  sendInput(sessionId: string, payload: Record<string, unknown>): void {
    this.manager.sendInput(sessionId, payload);
  }

  drainEvents(after?: number, limit?: number): WorkspaceEvent[] {
    return this.manager.drainEvents(after, limit);
  }

  listSessions(): WorkspaceSession[] {
    return this.manager.listSessions();
  }

  requestApproval(request: ApprovalRequestInput): ApprovalRequest {
    return this.manager.requestApproval(request);
  }

  resolveApproval(decision: ApprovalDecisionInput): ApprovalDecision {
    return this.manager.resolveApproval(decision);
  }

  getSnapshot(): WorkspaceSnapshot {
    return this.manager.getSnapshot();
  }

  reset(): void {
    this.manager.reset();
  }
}
