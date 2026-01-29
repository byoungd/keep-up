import type { CoworkSession } from "@ku0/agent-runtime";
import type { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createApprovalRoutes } from "../routes/approvals";
import type { CoworkRuntimeBridge } from "../runtime/coworkRuntime";
import type { CoworkTaskRuntime } from "../runtime/coworkTaskRuntime";
import type { ApprovalStoreLike, SessionStoreLike } from "../storage/contracts";
import type { CoworkApproval, CoworkApprovalStatus } from "../storage/types";
import { COWORK_EVENTS, SessionEventHub } from "../streaming/eventHub";

class MockSessionStore implements SessionStoreLike {
  private readonly sessions = new Map<string, CoworkSession>();

  async getAll(): Promise<CoworkSession[]> {
    return Array.from(this.sessions.values());
  }

  async getById(sessionId: string): Promise<CoworkSession | null> {
    return this.sessions.get(sessionId) ?? null;
  }

  async create(session: CoworkSession): Promise<CoworkSession> {
    this.sessions.set(session.sessionId, session);
    return session;
  }

  async update(
    sessionId: string,
    updater: (session: CoworkSession) => CoworkSession
  ): Promise<CoworkSession | null> {
    const existing = this.sessions.get(sessionId);
    if (!existing) {
      return null;
    }
    const next = updater(existing);
    this.sessions.set(sessionId, next);
    return next;
  }

  async delete(sessionId: string): Promise<boolean> {
    return this.sessions.delete(sessionId);
  }
}

class MockApprovalStore implements ApprovalStoreLike {
  private readonly approvals = new Map<string, CoworkApproval>();

  async getAll(): Promise<CoworkApproval[]> {
    return Array.from(this.approvals.values());
  }

  async getById(approvalId: string): Promise<CoworkApproval | null> {
    return this.approvals.get(approvalId) ?? null;
  }

  async getBySession(sessionId: string): Promise<CoworkApproval[]> {
    return Array.from(this.approvals.values()).filter(
      (approval) => approval.sessionId === sessionId
    );
  }

  async create(approval: CoworkApproval): Promise<CoworkApproval> {
    this.approvals.set(approval.approvalId, approval);
    return approval;
  }

  async update(
    approvalId: string,
    updater: (approval: CoworkApproval) => CoworkApproval
  ): Promise<CoworkApproval | null> {
    const existing = this.approvals.get(approvalId);
    if (!existing) {
      return null;
    }
    const next = updater(existing);
    this.approvals.set(approvalId, next);
    return next;
  }
}

function createSession(): CoworkSession {
  return {
    sessionId: "session-1",
    userId: "user-1",
    deviceId: "device-1",
    platform: "macos",
    mode: "cowork",
    isolationLevel: "main",
    grants: [
      {
        id: "grant-1",
        rootPath: "/tmp",
        allowWrite: true,
        allowDelete: true,
        allowCreate: true,
      },
    ],
    connectors: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

function createApproval(status: CoworkApprovalStatus = "pending"): CoworkApproval {
  return {
    approvalId: "approval-1",
    sessionId: "session-1",
    taskId: "task-1",
    action: "file.write:/tmp/example.txt",
    riskTags: ["overwrite"],
    reason: "Need to write file",
    status,
    createdAt: 1,
  };
}

describe("Approval routes", () => {
  let app: Hono;
  let sessionStore: MockSessionStore;
  let approvalStore: MockApprovalStore;
  let eventHub: SessionEventHub;
  let runtime: CoworkRuntimeBridge;
  let taskRuntime: CoworkTaskRuntime | undefined;
  let checkAction: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    sessionStore = new MockSessionStore();
    approvalStore = new MockApprovalStore();
    eventHub = new SessionEventHub();
    checkAction = vi.fn();
    runtime = { checkAction } as unknown as CoworkRuntimeBridge;
    taskRuntime = undefined;

    app = createApprovalRoutes({
      approvals: approvalStore,
      sessions: sessionStore,
      events: eventHub,
      runtime,
      taskRuntime,
    });
  });

  it("lists approvals for a session", async () => {
    await approvalStore.create(createApproval());

    const res = await app.request("/sessions/session-1/approvals");
    expect(res.status).toBe(200);
    const data = (await res.json()) as { ok: boolean; approvals: CoworkApproval[] };
    expect(data.ok).toBe(true);
    expect(data.approvals).toHaveLength(1);
    expect(data.approvals[0]?.approvalId).toBe("approval-1");
  });

  it("rejects invalid tool check payloads", async () => {
    await sessionStore.create(createSession());

    const res = await app.request("/sessions/session-1/tools/check", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });

  it("returns 404 when the session is missing", async () => {
    checkAction.mockResolvedValue({
      status: "allowed",
      decision: { decision: "allow", riskTags: [] },
    });

    const res = await app.request("/sessions/session-1/tools/check", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "network", host: "example.com" }),
    });

    expect(res.status).toBe(404);
  });

  it("publishes approval required events", async () => {
    await sessionStore.create(createSession());
    const approval = createApproval();
    checkAction.mockResolvedValue({
      status: "approval_required",
      decision: { decision: "allow_with_confirm", riskTags: approval.riskTags, ruleId: "rule-1" },
      approval,
    });

    const res = await app.request("/sessions/session-1/tools/check", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "network", host: "example.com" }),
    });

    expect(res.status).toBe(200);
    const events = eventHub.listSince("session-1");
    expect(events).toHaveLength(1);
    expect(events[0]?.type).toBe(COWORK_EVENTS.APPROVAL_REQUIRED);
    expect(events[0]?.data).toEqual({
      approvalId: approval.approvalId,
      action: approval.action,
      riskTags: approval.riskTags,
      reason: approval.reason,
    });
  });

  it("rejects invalid approval decisions", async () => {
    const res = await app.request("/approvals/approval-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "pending" }),
    });

    expect(res.status).toBe(400);
  });

  it("returns 404 when approving a missing approval", async () => {
    const res = await app.request("/approvals/approval-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "approved" }),
    });

    expect(res.status).toBe(404);
  });

  it("updates approvals and emits resolved events", async () => {
    await approvalStore.create(createApproval());

    const res = await app.request("/approvals/approval-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "approved" }),
    });

    expect(res.status).toBe(200);
    const data = (await res.json()) as { ok: boolean; approval: CoworkApproval };
    expect(data.ok).toBe(true);
    expect(data.approval.status).toBe("approved");
    expect(typeof data.approval.resolvedAt).toBe("number");

    const stored = await approvalStore.getById("approval-1");
    expect(stored?.status).toBe("approved");

    const events = eventHub.listSince("session-1");
    expect(events).toHaveLength(1);
    expect(events[0]?.type).toBe(COWORK_EVENTS.APPROVAL_RESOLVED);
    expect(events[0]?.data).toEqual({
      approvalId: "approval-1",
      status: "approved",
      taskId: "task-1",
    });
  });
});
