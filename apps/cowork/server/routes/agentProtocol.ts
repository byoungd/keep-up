import type { CoworkSession, CoworkTask } from "@ku0/agent-runtime";
import { Hono } from "hono";
import { formatZodError, jsonError, readJsonBody } from "../http";
import {
  agentProtocolArtifactSchema,
  agentProtocolStepSchema,
  agentProtocolTaskSchema,
} from "../schemas";
import type {
  ArtifactStoreLike,
  AuditLogStoreLike,
  SessionStoreLike,
  StepStoreLike,
  TaskStoreLike,
} from "../storage/contracts";
import type { CoworkArtifactRecord, CoworkTaskStepRecord } from "../storage/types";

interface AgentProtocolRouteDeps {
  sessionStore: SessionStoreLike;
  taskStore: TaskStoreLike;
  stepStore: StepStoreLike;
  artifactStore: ArtifactStoreLike;
  auditLogStore: AuditLogStoreLike;
}

const DEFAULT_PROTOCOL_SESSION_ID = "agent-protocol";
const DEFAULT_PROTOCOL_SESSION_TITLE = "Agent Protocol";

export function createAgentProtocolRoutes(deps: AgentProtocolRouteDeps) {
  const app = new Hono();

  app.post("/agent/tasks", async (c) => {
    const body = await readJsonBody(c);
    const parsed = agentProtocolTaskSchema.safeParse(body ?? {});
    if (!parsed.success) {
      return jsonError(c, 400, "Invalid agent task payload", formatZodError(parsed.error));
    }

    const additionalInput = parsed.data.additional_input ?? {};
    const requestedSessionId =
      readOptionalString(additionalInput.sessionId) ??
      readOptionalString(additionalInput.session_id);
    const sessionId = requestedSessionId ?? DEFAULT_PROTOCOL_SESSION_ID;
    const session = await ensureProtocolSession(deps.sessionStore, sessionId);

    const now = Date.now();
    const taskId = crypto.randomUUID();
    const title = buildTaskTitle(parsed.data.input);
    const task: CoworkTask = {
      taskId,
      sessionId: session.sessionId,
      title,
      prompt: parsed.data.input,
      status: "queued",
      metadata: {
        agentProtocol: {
          additionalInput,
        },
      },
      createdAt: now,
      updatedAt: now,
    };

    await deps.taskStore.create(task);
    await deps.auditLogStore.log({
      entryId: crypto.randomUUID(),
      sessionId: session.sessionId,
      taskId,
      timestamp: now,
      action: "agent_protocol_task_created",
      toolName: "agent.protocol",
      input: { taskId, sessionId: session.sessionId },
      outcome: "success",
    });

    return c.json(
      {
        ok: true,
        task: toAgentProtocolTask(task, [], additionalInput),
      },
      201
    );
  });

  app.get("/agent/tasks", async (c) => {
    const page = readPageNumber(c.req.query("page"));
    const pageSize = readPageSize(c.req.query("page_size") ?? c.req.query("pageSize"));

    const allTasks = await deps.taskStore.getAll();
    const tasks = allTasks.filter(isAgentProtocolTask);
    const { items, pagination } = paginate(tasks, page, pageSize);

    const artifactsByTask = await Promise.all(
      items.map((task) => deps.artifactStore.getByTask(task.taskId))
    );

    const responseTasks = items.map((task, index) =>
      toAgentProtocolTask(
        task,
        artifactsByTask[index] ?? [],
        readAgentProtocolAdditionalInput(task)
      )
    );

    return c.json({ ok: true, tasks: responseTasks, pagination });
  });

  app.get("/agent/tasks/:taskId", async (c) => {
    const taskId = c.req.param("taskId");
    const task = await deps.taskStore.getById(taskId);
    if (!task || !isAgentProtocolTask(task)) {
      return jsonError(c, 404, "Task not found");
    }

    const artifacts = await deps.artifactStore.getByTask(taskId);
    const additionalInput = readAgentProtocolAdditionalInput(task);

    return c.json({
      ok: true,
      task: toAgentProtocolTask(task, artifacts, additionalInput),
    });
  });

  app.get("/agent/tasks/:taskId/steps", async (c) => {
    const taskId = c.req.param("taskId");
    const task = await deps.taskStore.getById(taskId);
    if (!task || !isAgentProtocolTask(task)) {
      return jsonError(c, 404, "Task not found");
    }

    const page = readPageNumber(c.req.query("page"));
    const pageSize = readPageSize(c.req.query("page_size") ?? c.req.query("pageSize"));
    const steps = await deps.stepStore.getByTask(taskId);
    const { items, pagination } = paginate(steps, page, pageSize);

    return c.json({
      ok: true,
      steps: items.map(toAgentProtocolStep),
      pagination,
    });
  });

  app.post("/agent/tasks/:taskId/steps", async (c) => {
    const taskId = c.req.param("taskId");
    const task = await deps.taskStore.getById(taskId);
    if (!task || !isAgentProtocolTask(task)) {
      return jsonError(c, 404, "Task not found");
    }

    const body = (await readJsonBody(c)) ?? { input: "y" };
    const parsed = agentProtocolStepSchema.safeParse(body);
    if (!parsed.success) {
      return jsonError(c, 400, "Invalid task step payload", formatZodError(parsed.error));
    }

    const additionalInput = parsed.data.additional_input ?? {};
    const now = Date.now();
    const step: CoworkTaskStepRecord = {
      stepId: crypto.randomUUID(),
      taskId,
      name: parsed.data.name,
      input: parsed.data.input,
      additionalInput,
      status: readStepStatus(additionalInput.status),
      output: readOptionalString(additionalInput.output),
      additionalOutput: readOptionalRecord(additionalInput.additional_output),
      artifacts: readStringArray(additionalInput.artifacts),
      isLast: readOptionalBoolean(additionalInput.is_last) ?? false,
      createdAt: now,
      updatedAt: now,
    };

    await deps.stepStore.create(step);
    await deps.auditLogStore.log({
      entryId: crypto.randomUUID(),
      sessionId: task.sessionId,
      taskId,
      timestamp: now,
      action: "agent_protocol_step_created",
      toolName: "agent.protocol",
      input: { taskId, stepId: step.stepId },
      outcome: "success",
    });

    return c.json({ ok: true, step: toAgentProtocolStep(step) }, 201);
  });

  app.get("/agent/tasks/:taskId/steps/:stepId", async (c) => {
    const taskId = c.req.param("taskId");
    const stepId = c.req.param("stepId");
    const step = await deps.stepStore.getById(stepId);
    if (!step || step.taskId !== taskId) {
      return jsonError(c, 404, "Step not found");
    }

    return c.json({ ok: true, step: toAgentProtocolStep(step) });
  });

  app.get("/agent/tasks/:taskId/artifacts", async (c) => {
    const taskId = c.req.param("taskId");
    const task = await deps.taskStore.getById(taskId);
    if (!task || !isAgentProtocolTask(task)) {
      return jsonError(c, 404, "Task not found");
    }

    const page = readPageNumber(c.req.query("page"));
    const pageSize = readPageSize(c.req.query("page_size") ?? c.req.query("pageSize"));
    const artifacts = await deps.artifactStore.getByTask(taskId);
    const { items, pagination } = paginate(artifacts, page, pageSize);

    return c.json({
      ok: true,
      artifacts: items.map(toAgentProtocolArtifact),
      pagination,
    });
  });

  app.post("/agent/tasks/:taskId/artifacts", async (c) => {
    const taskId = c.req.param("taskId");
    const task = await deps.taskStore.getById(taskId);
    if (!task || !isAgentProtocolTask(task)) {
      return jsonError(c, 404, "Task not found");
    }

    const body = await readJsonBody(c);
    const parsed = agentProtocolArtifactSchema.safeParse(body ?? {});
    if (!parsed.success) {
      return jsonError(c, 400, "Invalid artifact payload", formatZodError(parsed.error));
    }

    if (!isRecord(parsed.data.artifact)) {
      return jsonError(c, 400, "Invalid artifact payload");
    }

    const now = Date.now();
    const artifact: CoworkArtifactRecord = {
      artifactId: crypto.randomUUID(),
      sessionId: task.sessionId,
      taskId,
      title: parsed.data.title,
      type: parsed.data.type,
      artifact: {
        ...parsed.data.artifact,
        type: parsed.data.type,
      } as CoworkArtifactRecord["artifact"],
      sourcePath: parsed.data.sourcePath,
      version: 1,
      status: "pending",
      createdAt: now,
      updatedAt: now,
    };

    await deps.artifactStore.upsert(artifact);
    await deps.auditLogStore.log({
      entryId: crypto.randomUUID(),
      sessionId: task.sessionId,
      taskId,
      timestamp: now,
      action: "agent_protocol_artifact_created",
      toolName: "agent.protocol",
      input: { taskId, artifactId: artifact.artifactId },
      outcome: "success",
    });

    return c.json({ ok: true, artifact: toAgentProtocolArtifact(artifact) }, 201);
  });

  app.get("/agent/tasks/:taskId/artifacts/:artifactId", async (c) => {
    const taskId = c.req.param("taskId");
    const artifactId = c.req.param("artifactId");
    const artifact = await deps.artifactStore.getById(artifactId);
    if (!artifact || artifact.taskId !== taskId) {
      return jsonError(c, 404, "Artifact not found");
    }

    return c.json({
      ok: true,
      artifact: toAgentProtocolArtifact(artifact),
      payload: artifact.artifact,
    });
  });

  return app;
}

function buildTaskTitle(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) {
    return "Agent Task";
  }
  return trimmed.length > 80 ? `${trimmed.slice(0, 77)}...` : trimmed;
}

async function ensureProtocolSession(
  sessionStore: SessionStoreLike,
  sessionId: string
): Promise<CoworkSession> {
  const existing = await sessionStore.getById(sessionId);
  if (existing) {
    return existing;
  }

  const now = Date.now();
  const session: CoworkSession = {
    sessionId,
    userId: "agent-protocol",
    deviceId: "agent-protocol",
    platform: "macos",
    mode: "cowork",
    grants: [],
    connectors: [],
    createdAt: now,
    updatedAt: now,
    title: DEFAULT_PROTOCOL_SESSION_TITLE,
  };

  await sessionStore.create(session);
  return session;
}

function isAgentProtocolTask(task: CoworkTask): boolean {
  return Boolean(readAgentProtocolAdditionalInput(task));
}

function readAgentProtocolAdditionalInput(task: CoworkTask): Record<string, unknown> | null {
  if (!task.metadata || !isRecord(task.metadata.agentProtocol)) {
    return null;
  }
  const agentProtocol = task.metadata.agentProtocol;
  if (!isRecord(agentProtocol.additionalInput)) {
    return {};
  }
  return agentProtocol.additionalInput;
}

function toAgentProtocolTask(
  task: CoworkTask,
  artifacts: CoworkArtifactRecord[],
  additionalInput: Record<string, unknown> | null
) {
  return {
    task_id: task.taskId,
    input: task.prompt,
    additional_input: additionalInput ?? {},
    created_at: new Date(task.createdAt).toISOString(),
    modified_at: new Date(task.updatedAt).toISOString(),
    artifacts: artifacts.map(toAgentProtocolArtifact),
  };
}

function toAgentProtocolStep(step: CoworkTaskStepRecord) {
  return {
    task_id: step.taskId,
    step_id: step.stepId,
    name: step.name,
    input: step.input,
    additional_input: step.additionalInput ?? {},
    status: step.status,
    output: step.output,
    additional_output: step.additionalOutput ?? undefined,
    artifacts: step.artifacts ?? [],
    is_last: step.isLast,
    created_at: new Date(step.createdAt).toISOString(),
    modified_at: new Date(step.updatedAt).toISOString(),
  };
}

function toAgentProtocolArtifact(artifact: CoworkArtifactRecord) {
  return {
    artifact_id: artifact.artifactId,
    file_name: artifact.title,
    relative_path: artifact.sourcePath ?? "",
    agent_created: true,
    created_at: new Date(artifact.createdAt).toISOString(),
    modified_at: new Date(artifact.updatedAt).toISOString(),
  };
}

function paginate<T>(items: T[], page: number, pageSize: number) {
  const total = items.length;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const current = Math.min(Math.max(page, 1), pages);
  const start = (current - 1) * pageSize;
  const end = start + pageSize;
  return {
    items: items.slice(start, end),
    pagination: {
      total,
      pages,
      current,
      pageSize,
    },
  };
}

function readPageNumber(value: string | undefined): number {
  const parsed = Number.parseInt(value ?? "1", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

function readPageSize(value: string | undefined): number {
  const parsed = Number.parseInt(value ?? "10", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 10;
}

function readOptionalString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function readOptionalBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function readOptionalRecord(value: unknown): Record<string, unknown> | undefined {
  return isRecord(value) ? value : undefined;
}

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((entry): entry is string => typeof entry === "string");
}

function readStepStatus(value: unknown): CoworkTaskStepRecord["status"] {
  if (value === "running" || value === "completed") {
    return value;
  }
  return "created";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
