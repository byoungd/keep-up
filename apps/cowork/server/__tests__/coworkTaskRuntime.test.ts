import { mkdtemp, readFile, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  type CoworkSession,
  createCoworkRuntime,
  createFileToolServer,
  createMockLLM,
  createToolRegistry,
} from "@ku0/agent-runtime";
import { describe, expect, it } from "vitest";
import { CoworkTaskRuntime } from "../runtime/coworkTaskRuntime";
import { createAgentStateCheckpointStore } from "../storage/agentStateStore";
import { createApprovalStore } from "../storage/approvalStore";
import { createArtifactStore } from "../storage/artifactStore";
import { createAuditLogStore } from "../storage/auditLogStore";
import { createChatMessageStore } from "../storage/chatMessageStore";
import { createConfigStore } from "../storage/configStore";
import type { StorageLayer } from "../storage/contracts";
import { createProjectStore } from "../storage/projectStore";
import { createSessionStore } from "../storage/sessionStore";
import { createTaskStore } from "../storage/taskStore";
import { SessionEventHub } from "../streaming/eventHub";

async function createStorageLayer() {
  const dir = await mkdtemp(join(tmpdir(), "cowork-runtime-"));
  const storage: StorageLayer = {
    sessionStore: createSessionStore(join(dir, "sessions.json")),
    taskStore: createTaskStore(join(dir, "tasks.json")),
    artifactStore: createArtifactStore(join(dir, "artifacts.json")),
    chatMessageStore: createChatMessageStore(join(dir, "chat_messages.json")),
    approvalStore: createApprovalStore(join(dir, "approvals.json")),
    agentStateStore: createAgentStateCheckpointStore(join(dir, "agent_state.json")),
    configStore: createConfigStore(join(dir, "settings.json")),
    projectStore: createProjectStore(join(dir, "projects.json")),
    auditLogStore: createAuditLogStore(join(dir, "audit_logs.json")),
  };
  return { storage, dir };
}

function createSession(rootPath: string): CoworkSession {
  return {
    sessionId: crypto.randomUUID(),
    userId: "user-1",
    deviceId: "device-1",
    platform: "macos",
    mode: "cowork",
    grants: [
      {
        id: crypto.randomUUID(),
        rootPath,
        allowCreate: true,
        allowWrite: true,
        allowDelete: true,
      },
    ],
    connectors: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

async function waitForStatus(
  storage: StorageLayer,
  taskId: string,
  status: string,
  attempts = 200
) {
  for (let i = 0; i < attempts; i++) {
    const task = await storage.taskStore.getById(taskId);
    if (task?.status === status) {
      return task;
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(`Timed out waiting for status ${status}`);
}

async function waitForArtifacts(storage: StorageLayer, taskId: string, attempts = 200) {
  for (let i = 0; i < attempts; i++) {
    const artifacts = await storage.artifactStore.getByTask(taskId);
    if (artifacts.length > 0) {
      return artifacts;
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error("Timed out waiting for artifacts");
}

describe("CoworkTaskRuntime", () => {
  it("runs a basic task and marks it completed", async () => {
    const { storage, dir } = await createStorageLayer();
    try {
      const eventHub = new SessionEventHub();
      const rootPath = await realpath(dir);
      const session = createSession(rootPath);
      await storage.sessionStore.create(session);

      let runtimeRef: ReturnType<typeof createCoworkRuntime> | undefined;
      const runtime = new CoworkTaskRuntime({
        storage,
        events: eventHub,
        runtimeFactory: async (seed) => {
          const llm = createMockLLM();
          llm.setDefaultResponse({ content: "All done.", finishReason: "stop" });
          const registry = createToolRegistry();
          const runtimeInstance = createCoworkRuntime({
            llm,
            registry,
            cowork: { session: seed },
            taskQueueConfig: { maxConcurrent: 1 },
          });
          runtimeRef = runtimeInstance;
          return runtimeInstance;
        },
      });

      const task = await runtime.enqueueTask(session.sessionId, { prompt: "Say hello" });
      expect(task.status).toBe("queued");

      if (!runtimeRef) {
        throw new Error("Runtime not created");
      }
      await runtimeRef.waitForTask(task.taskId);

      const updated = await waitForStatus(storage, task.taskId, "completed");
      expect(updated.status).toBe("completed");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("persists summary artifacts for completed tasks", async () => {
    const { storage, dir } = await createStorageLayer();
    try {
      const eventHub = new SessionEventHub();
      const rootPath = await realpath(dir);
      const session = createSession(rootPath);
      await storage.sessionStore.create(session);

      let runtimeRef: ReturnType<typeof createCoworkRuntime> | undefined;
      const runtime = new CoworkTaskRuntime({
        storage,
        events: eventHub,
        runtimeFactory: async (seed) => {
          const llm = createMockLLM();
          llm.setDefaultResponse({ content: "All done.", finishReason: "stop" });
          const registry = createToolRegistry();
          const runtimeInstance = createCoworkRuntime({
            llm,
            registry,
            cowork: { session: seed },
            taskQueueConfig: { maxConcurrent: 1 },
          });
          runtimeRef = runtimeInstance;
          return runtimeInstance;
        },
      });

      const task = await runtime.enqueueTask(session.sessionId, { prompt: "Say hello" });

      if (!runtimeRef) {
        throw new Error("Runtime not created");
      }

      await runtimeRef.waitForTask(task.taskId);

      const artifacts = await waitForArtifacts(storage, task.taskId);
      const summary = artifacts.find(
        (artifact) => artifact.artifactId === `summary-${task.taskId}`
      );
      expect(summary).toBeDefined();
      expect(summary?.type).toBe("markdown");
      expect(summary?.title).toBe("Summary");
      if (summary?.artifact.type === "markdown") {
        expect(summary.artifact.content).toContain("All done.");
      }
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("creates an approval and proceeds after resolution", async () => {
    const { storage, dir } = await createStorageLayer();
    try {
      const eventHub = new SessionEventHub();
      const rootPath = await realpath(dir);
      const session = createSession(rootPath);
      await storage.sessionStore.create(session);

      let runtimeRef: ReturnType<typeof createCoworkRuntime> | undefined;
      const runtime = new CoworkTaskRuntime({
        storage,
        events: eventHub,
        runtimeFactory: async (seed) => {
          const filePath = join(rootPath, "note.txt");
          const llm = createSequencedLLM([
            {
              content: "",
              finishReason: "tool_use",
              toolCalls: [
                {
                  name: "file:write",
                  arguments: { path: filePath, content: "hello" },
                },
                {
                  name: "file:delete",
                  arguments: { path: filePath },
                },
              ],
            },
            { content: "Done.", finishReason: "stop" },
          ]);
          const registry = createToolRegistry();
          await registry.register(createFileToolServer());
          const runtimeInstance = createCoworkRuntime({
            llm,
            registry,
            cowork: { session: seed },
            taskQueueConfig: { maxConcurrent: 1 },
          });
          runtimeRef = runtimeInstance;
          return runtimeInstance;
        },
      });

      const task = await runtime.enqueueTask(session.sessionId, { prompt: "write file" });
      expect(task.status).toBe("queued");

      await withTimeout(waitForApprovalRecord(storage, session.sessionId), 2000, "approval record");
      const approvals = await storage.approvalStore.getBySession(session.sessionId);
      const pendingApprovals = approvals.filter((approval) => approval.status === "pending");
      expect(pendingApprovals.length).toBeGreaterThan(0);
      expect(pendingApprovals.length).toBe(1);
      const [pending] = pendingApprovals;
      if (!pending) {
        throw new Error("Missing pending approval");
      }
      const updated = await runtime.resolveApproval(pending.approvalId, "approved");
      expect(updated?.status).toBe("approved");
      const stored = await storage.approvalStore.getById(pending.approvalId);
      expect(stored?.status).toBe("approved");

      if (!runtimeRef) {
        throw new Error("Runtime not created");
      }
      try {
        await withTimeout(runtimeRef.waitForTask(task.taskId), 5000, "task completion");
      } catch (error) {
        const state = runtimeRef.orchestrator.getState();
        const message = error instanceof Error ? error.message : "Timed out";
        throw new Error(
          `${message} (orchestrator status: ${state.status}, pending tools: ${state.pendingToolCalls.length})`
        );
      }

      await withTimeout(waitForStatus(storage, task.taskId, "completed"), 4000, "task status");
      await waitForArtifacts(storage, task.taskId);

      await expect(readFile(join(rootPath, "note.txt"), "utf-8")).rejects.toThrow();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }, 10000);

  it("executes tool calls with a confirmation handler", async () => {
    const dir = await mkdtemp(join(tmpdir(), "cowork-confirm-"));
    try {
      const rootPath = await realpath(dir);
      const session = createSession(rootPath);
      const filePath = join(rootPath, "note.txt");
      const llm = createSequencedLLM([
        {
          content: "",
          finishReason: "tool_use",
          toolCalls: [
            {
              name: "file:write",
              arguments: { path: filePath, content: "hello" },
            },
          ],
        },
        { content: "Done.", finishReason: "stop" },
      ]);

      const registry = createToolRegistry();
      await registry.register(createFileToolServer());
      const runtime = createCoworkRuntime({
        llm,
        registry,
        cowork: { session },
        taskQueueConfig: { maxConcurrent: 1 },
      });

      runtime.orchestrator.setConfirmationHandler(async () => true);
      const taskId = await runtime.enqueueTask("Write note");

      const result = await withTimeout(runtime.waitForTask(taskId), 5000, "task completion");
      expect(result?.state.status).toBe("complete");

      const contents = await readFile(filePath, "utf-8");
      expect(contents).toBe("hello");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

async function waitForApprovalRecord(storage: StorageLayer, sessionId: string) {
  for (let i = 0; i < 50; i++) {
    const approvals = await storage.approvalStore.getBySession(sessionId);
    const pending = approvals.find((approval) => approval.status === "pending");
    if (pending) {
      return pending;
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error("Timed out waiting for approval");
}

async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(`Timed out waiting for ${label}`));
    }, ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

function createSequencedLLM(
  responses: Array<{
    content: string;
    finishReason: "stop" | "tool_use" | "max_tokens";
    toolCalls?: Array<{ name: string; arguments: Record<string, unknown> }>;
  }>
): ReturnType<typeof createMockLLM> {
  const llm = createMockLLM();
  let index = 0;
  llm.complete = async () => {
    const response = responses[Math.min(index, responses.length - 1)];
    index += 1;
    return response;
  };
  return llm;
}
