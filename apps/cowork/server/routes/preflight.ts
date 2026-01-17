import { isPathWithinRoots } from "@ku0/agent-runtime";
import { Hono } from "hono";
import { jsonError, readJsonBody } from "../http";
import {
  createPreflightRunner,
  type PreflightRunInput,
  type PreflightRunner,
} from "../services/preflightRunner";
import type { ArtifactStoreLike, AuditLogStoreLike, SessionStoreLike } from "../storage/contracts";
import type { CoworkArtifactPayload } from "../storage/types";

interface PreflightRouteDeps {
  sessionStore: SessionStoreLike;
  artifactStore: ArtifactStoreLike;
  auditLogStore: AuditLogStoreLike;
  runner?: PreflightRunner;
}

interface PreflightRunPayload {
  sessionId?: string;
  taskId?: string;
  rootPath?: string;
  changedFiles?: string[];
  checkIds?: string[];
}

export function createPreflightRoutes(deps: PreflightRouteDeps) {
  const app = new Hono();
  const runner = deps.runner ?? createPreflightRunner();

  app.get("/preflight/checks", (c) => {
    return c.json({ ok: true, checks: runner.getAllowlist() });
  });

  app.post("/preflight", async (c) => {
    const body = (await readJsonBody(c)) as PreflightRunPayload | null;
    if (!body?.sessionId || typeof body.sessionId !== "string") {
      return jsonError(c, 400, "sessionId is required");
    }

    const session = await deps.sessionStore.getById(body.sessionId);
    if (!session) {
      return jsonError(c, 404, "Session not found");
    }

    const grantRoots = session.grants.map((grant) => grant.rootPath).filter(Boolean);
    const resolvedRoot = resolveRootPath(body.rootPath, grantRoots);
    if (!resolvedRoot) {
      return jsonError(c, 400, "No valid root path found for preflight");
    }

    const changedFiles = parseStringArray(body.changedFiles);
    const checkIds = parseStringArray(body.checkIds);

    const start = Date.now();
    const runInput: PreflightRunInput = {
      sessionId: body.sessionId,
      rootPath: resolvedRoot,
      changedFiles,
      requestedCheckIds: checkIds,
    };

    const { plan, report } = await runner.run(runInput);
    const artifactPayload: CoworkArtifactPayload = {
      type: "preflight",
      report,
      selectionNotes: plan.selectionNotes,
      changedFiles: plan.changedFiles,
    };

    const now = Date.now();
    const artifactRecord = await deps.artifactStore.upsert({
      artifactId: `preflight-${report.reportId}`,
      sessionId: body.sessionId,
      taskId: body.taskId,
      title: "Preflight Report",
      type: artifactPayload.type,
      artifact: artifactPayload,
      version: 1,
      status: "pending",
      createdAt: now,
      updatedAt: now,
    });

    void deps.auditLogStore.log({
      entryId: crypto.randomUUID(),
      sessionId: body.sessionId,
      taskId: body.taskId,
      timestamp: now,
      action: "preflight_run",
      toolName: "preflight.run",
      input: {
        checkIds: plan.checks.map((check) => check.id),
        changedFiles: plan.changedFiles,
      },
      output: {
        summary: report.riskSummary,
        checkCount: report.checks.length,
      },
      durationMs: Date.now() - start,
      outcome: report.checks.some((check) => check.status === "fail") ? "error" : "success",
    });

    return c.json({ ok: true, report, plan, artifact: artifactRecord }, 201);
  });

  return app;
}

function parseStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const result: string[] = [];
  for (const entry of value) {
    if (typeof entry === "string" && entry.trim().length > 0) {
      result.push(entry);
    }
  }
  return result.length > 0 ? result : undefined;
}

function resolveRootPath(requested: unknown, grantRoots: string[]): string | null {
  if (typeof requested === "string" && requested.trim().length > 0) {
    const trimmed = requested.trim();
    if (isPathWithinRoots(trimmed, grantRoots, false)) {
      return trimmed;
    }
    return null;
  }
  return grantRoots[0] ?? null;
}
