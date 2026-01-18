import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { CoworkSession } from "@ku0/agent-runtime";
import type { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createPreflightRoutes } from "../routes/preflight";
import type { PreflightRunner } from "../services/preflightRunner";
import type { ArtifactStoreLike, AuditLogStoreLike, SessionStoreLike } from "../storage/contracts";
import type { CoworkArtifactRecord, CoworkAuditEntry, CoworkAuditFilter } from "../storage/types";

class MockSessionStore implements SessionStoreLike {
  constructor(private readonly sessions = new Map<string, CoworkSession>()) {}

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
    const updated = updater(existing);
    this.sessions.set(sessionId, updated);
    return updated;
  }

  async delete(sessionId: string): Promise<boolean> {
    return this.sessions.delete(sessionId);
  }
}

class MockArtifactStore implements ArtifactStoreLike {
  public readonly records = new Map<string, CoworkArtifactRecord>();

  async getAll(): Promise<CoworkArtifactRecord[]> {
    return Array.from(this.records.values());
  }

  async getById(artifactId: string): Promise<CoworkArtifactRecord | null> {
    return this.records.get(artifactId) ?? null;
  }

  async getBySession(sessionId: string): Promise<CoworkArtifactRecord[]> {
    return Array.from(this.records.values()).filter((record) => record.sessionId === sessionId);
  }

  async getByTask(taskId: string): Promise<CoworkArtifactRecord[]> {
    return Array.from(this.records.values()).filter((record) => record.taskId === taskId);
  }

  async upsert(artifact: CoworkArtifactRecord): Promise<CoworkArtifactRecord> {
    this.records.set(artifact.artifactId, artifact);
    return artifact;
  }

  async delete(artifactId: string): Promise<boolean> {
    return this.records.delete(artifactId);
  }
}

class MockAuditLogStore implements AuditLogStoreLike {
  public readonly entries: CoworkAuditEntry[] = [];

  async log(entry: CoworkAuditEntry): Promise<void> {
    this.entries.push(entry);
  }

  async getBySession(_sessionId: string, _filter?: CoworkAuditFilter): Promise<CoworkAuditEntry[]> {
    return [];
  }

  async getByTask(_taskId: string): Promise<CoworkAuditEntry[]> {
    return [];
  }

  async query(_filter: CoworkAuditFilter): Promise<CoworkAuditEntry[]> {
    return [];
  }

  async getStats(_sessionId: string): Promise<{
    total: number;
    byAction: Record<string, number>;
    byTool: Record<string, number>;
    byOutcome: Record<string, number>;
  }> {
    return { total: 0, byAction: {}, byTool: {}, byOutcome: {} };
  }
}

describe("Preflight routes", () => {
  let app: Hono;
  let sessionStore: MockSessionStore;
  let artifactStore: MockArtifactStore;
  let auditStore: MockAuditLogStore;
  let rootPath: string;

  beforeEach(async () => {
    rootPath = await mkdtemp(join(tmpdir(), "cowork-preflight-"));
    sessionStore = new MockSessionStore();
    artifactStore = new MockArtifactStore();
    auditStore = new MockAuditLogStore();

    const session: CoworkSession = {
      sessionId: "session-1",
      userId: "user-1",
      deviceId: "device-1",
      platform: "macos",
      mode: "cowork",
      grants: [
        {
          id: "grant-1",
          rootPath,
          allowWrite: false,
          allowDelete: false,
          allowCreate: false,
        },
      ],
      connectors: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    await sessionStore.create(session);

    const runner: PreflightRunner = {
      getAllowlist: () => [
        {
          id: "lint",
          name: "Lint",
          kind: "lint",
          command: "pnpm",
          args: ["lint"],
        },
      ],
      run: async (input) => ({
        plan: {
          checks: [
            {
              id: "lint",
              name: "Lint",
              kind: "lint",
              command: "pnpm",
              args: ["lint"],
            },
          ],
          changedFiles: input.changedFiles ?? [],
          selectionNotes: ["Baseline preflight checks added."],
        },
        report: {
          reportId: "report-1",
          sessionId: input.sessionId,
          checks: [
            {
              id: "lint",
              name: "Lint",
              kind: "lint",
              command: "pnpm",
              args: ["lint"],
              status: "pass",
              durationMs: 10,
              output: "ok",
            },
          ],
          riskSummary: "1 passed, 0 failed",
          createdAt: Date.now(),
        },
      }),
    };

    app = createPreflightRoutes({
      sessionStore,
      artifactStore,
      auditLogStore: auditStore,
      runner,
    });
  });

  afterEach(async () => {
    await rm(rootPath, { recursive: true, force: true });
  });

  it("lists allowed checks", async () => {
    const res = await app.request("/preflight/checks");
    expect(res.status).toBe(200);
    const data = (await res.json()) as { checks: Array<{ id: string }> };
    expect(data.checks).toHaveLength(1);
  });

  it("runs preflight and stores report artifacts", async () => {
    const res = await app.request("/preflight", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId: "session-1" }),
    });
    expect(res.status).toBe(201);
    const data = (await res.json()) as {
      report: { reportId: string };
      artifact: CoworkArtifactRecord;
    };
    expect(data.report.reportId).toBe("report-1");
    expect(artifactStore.records.size).toBe(1);
    expect(auditStore.entries.length).toBe(1);
    expect(data.artifact.type).toBe("preflight");
  });

  it("blocks preflight when session is in plan mode", async () => {
    const planSession: CoworkSession = {
      sessionId: "session-plan",
      userId: "user-1",
      deviceId: "device-1",
      platform: "macos",
      mode: "cowork",
      agentMode: "plan",
      grants: [
        {
          id: "grant-2",
          rootPath,
          allowWrite: false,
          allowDelete: false,
          allowCreate: false,
        },
      ],
      connectors: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    await sessionStore.create(planSession);

    const res = await app.request("/preflight", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId: "session-plan" }),
    });
    expect(res.status).toBe(409);
    const data = (await res.json()) as { error?: { message?: string } };
    expect(data.error?.message).toBe("Preflight requires Build Mode");
  });
});
