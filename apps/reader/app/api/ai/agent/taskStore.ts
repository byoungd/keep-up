import { promises as fs } from "node:fs";
import * as path from "node:path";

import { resolveWorkspaceRoot } from "./agentShared";
import type { TaskSnapshot, TaskStatusSnapshot } from "./taskRuntime";

const TASK_HISTORY_TTL_MS = 1000 * 60 * 60 * 24 * 30;
const TASK_HISTORY_LIMIT = 200;
const MIN_PERSIST_INTERVAL_MS = 1500;

type PersistedTaskSnapshot = TaskSnapshot & { lastUpdatedAt: number };

type TaskHistoryStore = {
  version: 1;
  updatedAt: number;
  tasks: PersistedTaskSnapshot[];
};

const taskHistory = new Map<string, PersistedTaskSnapshot>();
let loadPromise: Promise<void> | null = null;
let writePromise: Promise<void> = Promise.resolve();

function getStorePath(): string {
  const workspaceRoot = resolveWorkspaceRoot();
  return path.join(workspaceRoot, ".keep-up", "state", "task-history.json");
}

function isTerminalStatus(status: TaskStatusSnapshot): boolean {
  return status === "completed" || status === "failed" || status === "cancelled";
}

function normalizeLoadedTask(task: PersistedTaskSnapshot, now: number): PersistedTaskSnapshot {
  if (!isTerminalStatus(task.status)) {
    return {
      ...task,
      status: "cancelled",
      error: task.error ?? "Task interrupted by server restart.",
      completedAt: task.completedAt ?? now,
      lastUpdatedAt: now,
    };
  }
  return task;
}

function isExpired(task: PersistedTaskSnapshot, now: number): boolean {
  const reference = task.completedAt ?? task.createdAt;
  return now - reference > TASK_HISTORY_TTL_MS;
}

function pruneHistory(now: number) {
  for (const [taskId, task] of taskHistory.entries()) {
    if (isExpired(task, now)) {
      taskHistory.delete(taskId);
    }
  }

  if (taskHistory.size <= TASK_HISTORY_LIMIT) {
    return;
  }

  const ordered = Array.from(taskHistory.values()).sort(
    (a, b) => b.lastUpdatedAt - a.lastUpdatedAt
  );
  const keep = new Set(ordered.slice(0, TASK_HISTORY_LIMIT).map((task) => task.taskId));
  for (const taskId of taskHistory.keys()) {
    if (!keep.has(taskId)) {
      taskHistory.delete(taskId);
    }
  }
}

async function loadStore(): Promise<void> {
  const filePath = getStorePath();
  try {
    const raw = await fs.readFile(filePath, "utf8");
    const parsed = JSON.parse(raw) as TaskHistoryStore;
    if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.tasks)) {
      return;
    }

    const now = Date.now();
    for (const task of parsed.tasks) {
      const normalized = normalizeLoadedTask(task, now);
      if (!isExpired(normalized, now)) {
        taskHistory.set(normalized.taskId, normalized);
      }
    }

    pruneHistory(now);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      console.warn("[taskStore] Failed to load task history:", error);
    }
  }
}

async function ensureLoaded(): Promise<void> {
  if (loadPromise) {
    return loadPromise;
  }
  loadPromise = loadStore();
  return loadPromise;
}

async function writeStore(): Promise<void> {
  const filePath = getStorePath();
  const dir = path.dirname(filePath);
  const payload: TaskHistoryStore = {
    version: 1,
    updatedAt: Date.now(),
    tasks: Array.from(taskHistory.values()),
  };
  const tempPath = `${filePath}.${process.pid}.tmp`;

  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(tempPath, JSON.stringify(payload, null, 2), "utf8");
  await fs.rename(tempPath, filePath);
}

function scheduleWrite(): Promise<void> {
  writePromise = writePromise.then(writeStore).catch((error) => {
    console.warn("[taskStore] Failed to persist task history:", error);
  });
  return writePromise;
}

export async function recordTaskSnapshot(snapshot: TaskSnapshot): Promise<void> {
  try {
    await ensureLoaded();
    const now = Date.now();
    const existing = taskHistory.get(snapshot.taskId);
    if (
      existing &&
      existing.status === snapshot.status &&
      existing.progress === snapshot.progress &&
      existing.progressMessage === snapshot.progressMessage &&
      now - existing.lastUpdatedAt < MIN_PERSIST_INTERVAL_MS &&
      !isTerminalStatus(snapshot.status)
    ) {
      return;
    }

    taskHistory.set(snapshot.taskId, { ...snapshot, lastUpdatedAt: now });
    pruneHistory(now);
    await scheduleWrite();
  } catch (error) {
    console.warn("[taskStore] Failed to record task snapshot:", error);
  }
}

export async function getArchivedTaskSnapshots(): Promise<TaskSnapshot[]> {
  try {
    await ensureLoaded();
    pruneHistory(Date.now());
    return Array.from(taskHistory.values()).map(
      ({ lastUpdatedAt: _lastUpdatedAt, ...rest }) => rest
    );
  } catch (error) {
    console.warn("[taskStore] Failed to read task history:", error);
    return [];
  }
}
