import type { CoworkSession, CoworkTask } from "@ku0/agent-runtime";
import type { Hono } from "hono";
import { beforeEach, describe, expect, it } from "vitest";
import { createAgentProtocolRoutes } from "../routes/agentProtocol";
import type {
  ArtifactStoreLike,
  AuditLogStoreLike,
  SessionStoreLike,
  StepStoreLike,
  TaskStoreLike,
} from "../storage/contracts";
import type {
  CoworkArtifactRecord,
  CoworkAuditEntry,
  CoworkAuditFilter,
  CoworkTaskStepRecord,
} from "../storage/types";

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

class MockStepStore implements StepStoreLike {
  private readonly steps = new Map<string, CoworkTaskStepRecord>();

  async getById(stepId: string): Promise<CoworkTaskStepRecord | null> {
    return this.steps.get(stepId) ?? null;
  }

  async getByTask(taskId: string): Promise<CoworkTaskStepRecord[]> {
    return Array.from(this.steps.values()).filter((step) => step.taskId === taskId);
  }

  async create(step: CoworkTaskStepRecord): Promise<CoworkTaskStepRecord> {
    this.steps.set(step.stepId, step);
    return step;
  }

  async update(
    stepId: string,
    updater: (step: CoworkTaskStepRecord) => CoworkTaskStepRecord
  ): Promise<CoworkTaskStepRecord | null> {
    const existing = this.steps.get(stepId);
    if (!existing) {
      return null;
    }
    const next = updater(existing);
    this.steps.set(stepId, next);
    return next;
  }
}

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

describe("Agent protocol routes", () => {
  let app: Hono;
  let sessionStore: MockSessionStore;
  let taskStore: MockTaskStore;
  let stepStore: MockStepStore;
  let artifactStore: MockArtifactStore;
  let auditLogStore: MockAuditLogStore;

  beforeEach(() => {
    sessionStore = new MockSessionStore();
    taskStore = new MockTaskStore();
    stepStore = new MockStepStore();
    artifactStore = new MockArtifactStore();
    auditLogStore = new MockAuditLogStore();

    app = createAgentProtocolRoutes({
      sessionStore,
      taskStore,
      stepStore,
      artifactStore,
      auditLogStore,
    });
  });

  it("creates tasks, steps, and artifacts", async () => {
    const taskRes = await app.request("/agent/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ input: "Prepare report", additional_input: { priority: "high" } }),
    });

    expect(taskRes.status).toBe(201);
    const taskData = (await taskRes.json()) as { task: { task_id: string } };
    const taskId = taskData.task.task_id;
    expect(taskId).toBeTruthy();

    const stepRes = await app.request(`/agent/tasks/${taskId}/steps`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ input: "Draft outline" }),
    });
    expect(stepRes.status).toBe(201);
    const stepData = (await stepRes.json()) as { step: { step_id: string } };
    expect(stepData.step.step_id).toBeTruthy();

    const artifactRes = await app.request(`/agent/tasks/${taskId}/artifacts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: "Outline",
        type: "markdown",
        artifact: { content: "# Outline" },
      }),
    });
    expect(artifactRes.status).toBe(201);
    const artifactData = (await artifactRes.json()) as { artifact: { artifact_id: string } };
    expect(artifactData.artifact.artifact_id).toBeTruthy();

    expect(auditLogStore.entries).toHaveLength(3);
    expect(auditLogStore.entries[0]?.action).toBe("agent_protocol_task_created");
    expect(auditLogStore.entries[1]?.action).toBe("agent_protocol_step_created");
    expect(auditLogStore.entries[2]?.action).toBe("agent_protocol_artifact_created");

    const sessions = await sessionStore.getAll();
    expect(sessions.length).toBe(1);
  });

  it("lists steps and artifacts", async () => {
    const task = await taskStore.create({
      taskId: "task-1",
      sessionId: "session-1",
      title: "Agent Task",
      prompt: "Task prompt",
      status: "queued",
      metadata: { agentProtocol: { additionalInput: {} } },
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    await stepStore.create({
      stepId: "step-1",
      taskId: task.taskId,
      name: "Step",
      input: "Do work",
      additionalInput: {},
      status: "created",
      output: "",
      additionalOutput: {},
      artifacts: [],
      isLast: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    await artifactStore.upsert({
      artifactId: "artifact-1",
      sessionId: task.sessionId,
      taskId: task.taskId,
      title: "Doc",
      type: "markdown",
      artifact: { type: "markdown", content: "Doc" },
      version: 1,
      status: "pending",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    const stepsRes = await app.request(`/agent/tasks/${task.taskId}/steps`);
    expect(stepsRes.status).toBe(200);
    const stepsData = (await stepsRes.json()) as { steps: Array<{ step_id: string }> };
    expect(stepsData.steps).toHaveLength(1);

    const artifactsRes = await app.request(`/agent/tasks/${task.taskId}/artifacts`);
    expect(artifactsRes.status).toBe(200);
    const artifactsData = (await artifactsRes.json()) as {
      artifacts: Array<{ artifact_id: string }>;
    };
    expect(artifactsData.artifacts).toHaveLength(1);
  });
});
