import type { CoworkSession, CoworkWorkspace } from "@ku0/agent-runtime";
import { Hono } from "hono";
import type { SessionStoreLike } from "../storage/contracts";

interface WorkspaceRouteDeps {
  sessionStore: SessionStoreLike;
}

function workspaceNameFromPath(path: string): string {
  const normalized = path.replace(/\\/g, "/");
  const parts = normalized.split("/").filter(Boolean);
  return parts[parts.length - 1] ?? path;
}

function buildWorkspaces(sessions: CoworkSession[]): CoworkWorkspace[] {
  const map = new Map<string, CoworkWorkspace>();

  for (const session of sessions) {
    const rootPath = session.grants[0]?.rootPath;
    const workspaceId = session.workspaceId ?? rootPath;
    if (!workspaceId) {
      continue;
    }
    const name = rootPath ? workspaceNameFromPath(rootPath) : workspaceId;
    const createdAt = session.createdAt;
    const lastOpenedAt = session.updatedAt ?? session.createdAt;
    const existing = map.get(workspaceId);
    if (!existing) {
      map.set(workspaceId, {
        workspaceId,
        name,
        pathHint: rootPath,
        createdAt,
        lastOpenedAt,
      });
      continue;
    }
    existing.createdAt = Math.min(existing.createdAt, createdAt);
    existing.lastOpenedAt = Math.max(existing.lastOpenedAt, lastOpenedAt);
    if (!existing.pathHint && rootPath) {
      existing.pathHint = rootPath;
    }
  }

  return Array.from(map.values()).sort((a, b) => b.lastOpenedAt - a.lastOpenedAt);
}

export function createWorkspaceRoutes(deps: WorkspaceRouteDeps) {
  const app = new Hono();

  app.get("/workspaces", async (c) => {
    const sessions = await deps.sessionStore.getAll();
    const workspaces = buildWorkspaces(sessions);
    return c.json({ ok: true, workspaces });
  });

  return app;
}
