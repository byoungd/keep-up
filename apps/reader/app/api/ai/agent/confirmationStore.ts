import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import * as path from "node:path";

import { resolveWorkspaceRoot } from "./agentShared";

const DEFAULT_CONFIRMATION_TIMEOUT_MS = 5 * 60 * 1000;
const CONFIRMATION_LOG_TTL_MS = 1000 * 60 * 60 * 24 * 7;
const CONFIRMATION_STORE_VERSION = 1;

type ConfirmationEntry = {
  requestId: string;
  resolve: (confirmed: boolean) => void;
  createdAt: number;
  timeoutId: NodeJS.Timeout;
  expiresAt: number;
  metadata?: ConfirmationMetadata;
};

type ConfirmationMetadata = {
  taskId?: string;
  toolName?: string;
  description?: string;
  risk?: "low" | "medium" | "high";
  reason?: string;
  riskTags?: string[];
  arguments?: Record<string, unknown>;
};

export type PendingTaskConfirmation = {
  confirmationId: string;
  requestId: string;
  createdAt: number;
  expiresAt: number;
  taskId: string;
  toolName: string;
  description: string;
  arguments: Record<string, unknown>;
  risk: "low" | "medium" | "high";
  reason?: string;
  riskTags?: string[];
};

type ConfirmationRecord = {
  confirmationId: string;
  requestId: string;
  createdAt: number;
  expiresAt: number;
  status: "pending" | "resolved" | "expired";
  confirmed?: boolean;
  metadata?: ConfirmationMetadata;
};

type ConfirmationStore = {
  version: number;
  updatedAt: number;
  confirmations: ConfirmationRecord[];
};

// NOTE: This in-memory store assumes a single long-lived server process (local desktop/dev).
// Replace with a persistent store for serverless or multi-instance deployments.
const confirmations = new Map<string, ConfirmationEntry>();
const confirmationLog = new Map<string, ConfirmationRecord>();
let loadPromise: Promise<void> | null = null;
let writePromise: Promise<void> = Promise.resolve();

function getStorePath(): string {
  const workspaceRoot = resolveWorkspaceRoot();
  return path.join(workspaceRoot, ".keep-up", "state", "confirmation-log.json");
}

function pruneLog(now: number) {
  for (const [id, record] of confirmationLog.entries()) {
    if (now - record.createdAt > CONFIRMATION_LOG_TTL_MS) {
      confirmationLog.delete(id);
    }
  }
}

async function loadStore(): Promise<void> {
  const filePath = getStorePath();
  try {
    const raw = await fs.readFile(filePath, "utf8");
    const parsed = JSON.parse(raw) as ConfirmationStore;
    if (!parsed || parsed.version !== CONFIRMATION_STORE_VERSION) {
      return;
    }

    const now = Date.now();
    for (const record of parsed.confirmations ?? []) {
      if (confirmationLog.has(record.confirmationId)) {
        continue;
      }
      const normalized: ConfirmationRecord =
        record.status === "pending"
          ? {
              ...record,
              status: "expired",
              confirmed: record.confirmed,
            }
          : record;

      if (now - normalized.createdAt <= CONFIRMATION_LOG_TTL_MS) {
        confirmationLog.set(normalized.confirmationId, normalized);
      }
    }

    pruneLog(now);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      console.warn("[confirmationStore] Failed to load confirmation log:", error);
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
  const payload: ConfirmationStore = {
    version: CONFIRMATION_STORE_VERSION,
    updatedAt: Date.now(),
    confirmations: Array.from(confirmationLog.values()),
  };
  const tempPath = `${filePath}.${process.pid}.tmp`;
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(tempPath, JSON.stringify(payload, null, 2), "utf8");
  await fs.rename(tempPath, filePath);
}

function scheduleWrite(): Promise<void> {
  writePromise = writePromise.then(writeStore).catch((error) => {
    console.warn("[confirmationStore] Failed to persist confirmation log:", error);
  });
  return writePromise;
}

export async function createPendingConfirmation(options: {
  requestId: string;
  timeoutMs?: number;
  metadata?: ConfirmationMetadata;
}): Promise<{ confirmationId: string; promise: Promise<boolean> }> {
  await ensureLoaded();
  const confirmationId = randomUUID();
  const timeoutMs = options.timeoutMs ?? DEFAULT_CONFIRMATION_TIMEOUT_MS;
  const createdAt = Date.now();
  const expiresAt = createdAt + timeoutMs;
  let resolvePromise: (value: boolean) => void = () => undefined;

  const promise = new Promise<boolean>((resolve) => {
    resolvePromise = resolve;
  });

  const timeoutId = setTimeout(() => {
    resolvePromise(false);
    confirmations.delete(confirmationId);
    confirmationLog.set(confirmationId, {
      confirmationId,
      requestId: options.requestId,
      createdAt,
      expiresAt,
      status: "expired",
      metadata: options.metadata,
    });
    pruneLog(Date.now());
    void scheduleWrite();
  }, timeoutMs);

  confirmations.set(confirmationId, {
    requestId: options.requestId,
    resolve: (confirmed) => {
      clearTimeout(timeoutId);
      resolvePromise(confirmed);
      confirmations.delete(confirmationId);
      confirmationLog.set(confirmationId, {
        confirmationId,
        requestId: options.requestId,
        createdAt,
        expiresAt,
        status: "resolved",
        confirmed,
        metadata: options.metadata,
      });
      pruneLog(Date.now());
      void scheduleWrite();
    },
    createdAt,
    timeoutId,
    expiresAt,
    metadata: options.metadata,
  });

  confirmationLog.set(confirmationId, {
    confirmationId,
    requestId: options.requestId,
    createdAt,
    expiresAt,
    status: "pending",
    metadata: options.metadata,
  });
  pruneLog(createdAt);
  void scheduleWrite();

  return { confirmationId, promise };
}

export async function resolvePendingConfirmation(options: {
  confirmationId: string;
  confirmed: boolean;
  requestId?: string;
}): Promise<
  | { status: "resolved"; requestId: string; confirmed: boolean }
  | { status: "not_found" }
  | { status: "request_mismatch"; requestId: string }
  | { status: "expired"; requestId: string }
> {
  await ensureLoaded();
  const entry = confirmations.get(options.confirmationId);
  if (!entry) {
    const record = confirmationLog.get(options.confirmationId);
    if (!record) {
      return { status: "not_found" };
    }
    if (options.requestId && record.requestId !== options.requestId) {
      return { status: "request_mismatch", requestId: record.requestId };
    }
    if (record.status === "resolved") {
      return {
        status: "resolved",
        requestId: record.requestId,
        confirmed: record.confirmed === true,
      };
    }
    if (record.status === "expired") {
      return { status: "expired", requestId: record.requestId };
    }
    const expiredRecord = { ...record, status: "expired" as const };
    confirmationLog.set(record.confirmationId, expiredRecord);
    pruneLog(Date.now());
    void scheduleWrite();
    return { status: "expired", requestId: record.requestId };
  }

  if (options.requestId && entry.requestId !== options.requestId) {
    return { status: "request_mismatch", requestId: entry.requestId };
  }

  entry.resolve(options.confirmed);
  return { status: "resolved", requestId: entry.requestId, confirmed: options.confirmed };
}

export async function listPendingTaskConfirmations(): Promise<PendingTaskConfirmation[]> {
  await ensureLoaded();
  const now = Date.now();
  const pending: PendingTaskConfirmation[] = [];
  for (const [confirmationId, entry] of confirmations.entries()) {
    if (entry.expiresAt <= now) {
      continue;
    }
    const metadata = entry.metadata;
    if (!metadata?.taskId) {
      continue;
    }
    pending.push({
      confirmationId,
      requestId: entry.requestId,
      createdAt: entry.createdAt,
      expiresAt: entry.expiresAt,
      taskId: metadata.taskId,
      toolName: metadata.toolName ?? "tool",
      description: metadata.description ?? "",
      arguments: metadata.arguments ?? {},
      risk: metadata.risk ?? "low",
      reason: metadata.reason,
      riskTags: metadata.riskTags,
    });
  }
  return pending;
}
