import type { CheckpointFilter, CheckpointStatus } from "@ku0/agent-runtime";
import { Hono } from "hono";
import { jsonError } from "../http";
import type { CoworkTaskRuntime } from "../runtime/coworkTaskRuntime";
import type { SessionStoreLike } from "../storage/contracts";

interface CheckpointRouteDeps {
  sessions: SessionStoreLike;
  taskRuntime?: CoworkTaskRuntime;
}

const CHECKPOINT_STATUSES: CheckpointStatus[] = ["pending", "completed", "failed", "cancelled"];

export function createCheckpointRoutes(deps: CheckpointRouteDeps) {
  const app = new Hono();

  app.get("/sessions/:sessionId/checkpoints", async (c) => {
    const sessionId = c.req.param("sessionId");
    const session = await deps.sessions.getById(sessionId);
    if (!session) {
      return jsonError(c, 404, "Session not found");
    }
    if (!deps.taskRuntime) {
      return jsonError(c, 503, "Cowork runtime is unavailable");
    }

    const filter = parseCheckpointFilter(c.req.raw);
    const checkpoints = await deps.taskRuntime.listCheckpoints(sessionId, filter);
    return c.json({ ok: true, checkpoints });
  });

  app.get("/sessions/:sessionId/checkpoints/:checkpointId", async (c) => {
    const sessionId = c.req.param("sessionId");
    const checkpointId = c.req.param("checkpointId");
    const session = await deps.sessions.getById(sessionId);
    if (!session) {
      return jsonError(c, 404, "Session not found");
    }
    if (!deps.taskRuntime) {
      return jsonError(c, 503, "Cowork runtime is unavailable");
    }

    const checkpoint = await deps.taskRuntime.getCheckpoint(sessionId, checkpointId);
    if (!checkpoint) {
      return jsonError(c, 404, "Checkpoint not found");
    }
    return c.json({ ok: true, checkpoint });
  });

  app.delete("/sessions/:sessionId/checkpoints/:checkpointId", async (c) => {
    const sessionId = c.req.param("sessionId");
    const checkpointId = c.req.param("checkpointId");
    const session = await deps.sessions.getById(sessionId);
    if (!session) {
      return jsonError(c, 404, "Session not found");
    }
    if (!deps.taskRuntime) {
      return jsonError(c, 503, "Cowork runtime is unavailable");
    }

    const removed = await deps.taskRuntime.deleteCheckpoint(sessionId, checkpointId);
    if (!removed) {
      return jsonError(c, 404, "Checkpoint not found");
    }
    return c.json({ ok: true, removed });
  });

  app.post("/sessions/:sessionId/checkpoints/:checkpointId/restore", async (c) => {
    const sessionId = c.req.param("sessionId");
    const checkpointId = c.req.param("checkpointId");
    const session = await deps.sessions.getById(sessionId);
    if (!session) {
      return jsonError(c, 404, "Session not found");
    }
    if (!deps.taskRuntime) {
      return jsonError(c, 503, "Cowork runtime is unavailable");
    }

    try {
      const result = await deps.taskRuntime.restoreCheckpoint(sessionId, checkpointId);
      return c.json({ ok: true, ...result });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to restore checkpoint";
      return jsonError(c, 409, message);
    }
  });

  return app;
}

function parseCheckpointFilter(req: Request): CheckpointFilter | undefined {
  const params = new URL(req.url, "http://localhost").searchParams;
  const statusValues = parseCheckpointStatus(params.get("status") ?? undefined);
  const limit = parseLimit(params.get("limit") ?? undefined);
  const createdAfter = parseNumber(params.get("createdAfter") ?? undefined);
  const createdBefore = parseNumber(params.get("createdBefore") ?? undefined);
  const sortBy = parseSortBy(params.get("sortBy") ?? undefined);
  const sortOrder = parseSortOrder(params.get("sortOrder") ?? undefined);
  const agentType = params.get("agentType") ?? undefined;

  const filter: CheckpointFilter = {
    ...(statusValues ? { status: statusValues } : {}),
    ...(limit ? { limit } : {}),
    ...(createdAfter !== undefined ? { createdAfter } : {}),
    ...(createdBefore !== undefined ? { createdBefore } : {}),
    ...(sortBy ? { sortBy } : {}),
    ...(sortOrder ? { sortOrder } : {}),
    ...(agentType ? { agentType } : {}),
  };

  return Object.keys(filter).length > 0 ? filter : undefined;
}

function parseCheckpointStatus(raw?: string): CheckpointStatus | CheckpointStatus[] | undefined {
  if (!raw) {
    return undefined;
  }
  const parts = raw
    .split(",")
    .map((value) => value.trim())
    .filter((value) => value.length > 0) as CheckpointStatus[];
  const valid = parts.filter((value) => CHECKPOINT_STATUSES.includes(value));
  if (valid.length === 0) {
    return undefined;
  }
  if (valid.length === 1) {
    return valid[0];
  }
  return valid;
}

function parseLimit(raw?: string): number | undefined {
  const parsed = raw ? Number.parseInt(raw, 10) : Number.NaN;
  if (Number.isNaN(parsed) || parsed <= 0) {
    return undefined;
  }
  return Math.min(parsed, 200);
}

function parseNumber(raw?: string): number | undefined {
  const parsed = raw ? Number.parseInt(raw, 10) : Number.NaN;
  if (Number.isNaN(parsed)) {
    return undefined;
  }
  return parsed;
}

function parseSortBy(value?: string): "createdAt" | "status" | undefined {
  if (value === "createdAt" || value === "status") {
    return value;
  }
  return undefined;
}

function parseSortOrder(value?: string): "asc" | "desc" | undefined {
  if (value === "asc" || value === "desc") {
    return value;
  }
  return undefined;
}
