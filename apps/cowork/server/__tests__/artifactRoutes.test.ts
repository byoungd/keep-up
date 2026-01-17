import type { CoworkSession, CoworkTask } from "@ku0/agent-runtime";
import type { Hono } from "hono";
import { beforeEach, describe, expect, it } from "vitest";
import { createArtifactRoutes } from "../routes/artifacts";
import type {
  ArtifactStoreLike,
  AuditLogStoreLike,
  SessionStoreLike,
  TaskStoreLike,
} from "../storage/contracts";
import type { CoworkArtifactRecord, CoworkAuditEntry, CoworkAuditFilter } from "../storage/types";

class MockArtifactStore implements ArtifactStoreLike {
  private readonly artifacts = new Map<string, CoworkArtifactRecord>();

  async getAll(): Promise<CoworkArtifactRecord[]> {
    return Array.from(this.artifacts.values());
  }

  async getById(artifactId: string): Promise<CoworkArtifactRecord | null> {
    return this.artifacts.get(artifactId) ?? null;
  }

  async getBySession(sessionId: string): Promise<CoworkArtifactRecord[]> {
    return Array.from(this.artifacts.values()).filter(
      (artifact) => artifact.sessionId === sessionId
    );
  }

  async getByTask(taskId: string): Promise<CoworkArtifactRecord[]> {
    return Array.from(this.artifacts.values()).filter((artifact) => artifact.taskId === taskId);
  }

  async upsert(artifact: CoworkArtifactRecord): Promise<CoworkArtifactRecord> {
    this.artifacts.set(artifact.artifactId, artifact);
    return artifact;
  }

  async delete(artifactId: string): Promise<boolean> {
    return this.artifacts.delete(artifactId);
  }
}

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

class MockTaskStore implements TaskStoreLike {
  private readonly tasks = new Map<string, CoworkTask>();

  async getAll(): Promise<CoworkTask[]> {
    return Array.from(this.tasks.values());
  }

  async getById(taskId: string): Promise<CoworkTask | null> {
    return this.tasks.get(taskId) ?? null;
  }

  async getBySession(sessionId: string): Promise<CoworkTask[]> {
    return Array.from(this.tasks.values()).filter((task) => task.sessionId === sessionId);
  }

  async create(task: CoworkTask): Promise<CoworkTask> {
    this.tasks.set(task.taskId, task);
    return task;
  }

  async update(
    taskId: string,
    updater: (task: CoworkTask) => CoworkTask
  ): Promise<CoworkTask | null> {
    const existing = this.tasks.get(taskId);
    if (!existing) {
      return null;
    }
    const next = updater(existing);
    this.tasks.set(taskId, next);
    return next;
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

describe("Artifact apply/revert routes", () => {
  let app: Hono;
  let artifactStore: MockArtifactStore;
  let auditLogStore: MockAuditLogStore;

  beforeEach(() => {
    artifactStore = new MockArtifactStore();
    auditLogStore = new MockAuditLogStore();
    const sessionStore = new MockSessionStore();
    const taskStore = new MockTaskStore();
    app = createArtifactRoutes({
      artifactStore,
      auditLogStore,
      sessionStore,
      taskStore,
    });
  });

  it("applies and reverts diff artifacts", async () => {
    await artifactStore.upsert({
      artifactId: "diff-1",
      sessionId: "session-1",
      taskId: "task-1",
      title: "Patch",
      type: "diff",
      artifact: { type: "diff", file: "file.txt", diff: "+hello" },
      version: 1,
      status: "pending",
      createdAt: 1,
      updatedAt: 1,
    });

    const applyRes = await app.request("/artifacts/diff-1/apply", { method: "POST" });
    expect(applyRes.status).toBe(200);
    const applyData = (await applyRes.json()) as {
      artifact: CoworkArtifactRecord;
    };
    expect(applyData.artifact.status).toBe("applied");
    expect(applyData.artifact.version).toBe(2);
    expect(applyData.artifact.appliedAt).toBeTypeOf("number");

    const revertRes = await app.request("/artifacts/diff-1/revert", { method: "POST" });
    expect(revertRes.status).toBe(200);
    const revertData = (await revertRes.json()) as {
      artifact: CoworkArtifactRecord;
    };
    expect(revertData.artifact.status).toBe("reverted");
    expect(revertData.artifact.version).toBe(3);
    expect(revertData.artifact.appliedAt).toBeUndefined();

    expect(auditLogStore.entries.length).toBe(2);
    expect(auditLogStore.entries[0]?.action).toBe("artifact_apply");
    expect(auditLogStore.entries[1]?.action).toBe("artifact_revert");
  });

  it("rejects apply for non-diff artifacts", async () => {
    await artifactStore.upsert({
      artifactId: "plan-1",
      sessionId: "session-1",
      taskId: "task-1",
      title: "Plan",
      type: "plan",
      artifact: { type: "plan", steps: [] },
      version: 1,
      status: "pending",
      createdAt: 1,
      updatedAt: 1,
    });

    const applyRes = await app.request("/artifacts/plan-1/apply", { method: "POST" });
    expect(applyRes.status).toBe(400);
  });
});
