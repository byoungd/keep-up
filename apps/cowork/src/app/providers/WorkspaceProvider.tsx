import type { CoworkSession } from "@ku0/agent-runtime";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import React from "react";
import { createSession as createSessionApi, listSessions } from "../../api/coworkApi";
import type { Session, Workspace } from "../../features/workspace/types";
import { config } from "../../lib/config";

const STORAGE_KEYS = {
  activeWorkspace: "cowork-active-workspace",
};

type WorkspaceContextValue = {
  workspaces: Workspace[];
  sessions: Session[];
  activeWorkspaceId: string | null;
  setActiveWorkspace: (workspaceId: string | null) => void;
  createSessionForPath: (path: string, title?: string) => Promise<Session>;
  getWorkspace: (workspaceId: string) => Workspace | null;
  getSession: (sessionId: string) => Session | null;
  getSessionsForWorkspace: (workspaceId: string) => Session[];
  refreshSessions: () => void;
};

const WorkspaceContext = React.createContext<WorkspaceContextValue | null>(null);

function readActiveWorkspace(): string | null {
  if (typeof window === "undefined") {
    return null;
  }
  return window.localStorage.getItem(STORAGE_KEYS.activeWorkspace);
}

function writeActiveWorkspace(value: string | null): void {
  if (typeof window === "undefined") {
    return;
  }
  if (value) {
    window.localStorage.setItem(STORAGE_KEYS.activeWorkspace, value);
  } else {
    window.localStorage.removeItem(STORAGE_KEYS.activeWorkspace);
  }
}

function workspaceNameFromPath(path: string): string {
  const parts = path.split("/").filter(Boolean);
  return parts[parts.length - 1] ?? path;
}

function mapSession(session: CoworkSession): Session {
  const rootPath = session.grants[0]?.rootPath ?? "unknown";
  return {
    id: session.sessionId,
    workspaceId: rootPath,
    title: `${workspaceNameFromPath(rootPath)} Session`,
    createdAt: session.createdAt,
  };
}

function buildWorkspaces(sessions: CoworkSession[]): Workspace[] {
  const map = new Map<string, Workspace>();
  for (const session of sessions) {
    const rootPath = session.grants[0]?.rootPath;
    if (!rootPath) {
      continue;
    }
    const existing = map.get(rootPath);
    const createdAt = existing
      ? Math.min(existing.createdAt, session.createdAt)
      : session.createdAt;
    const lastOpenedAt = existing
      ? Math.max(existing.lastOpenedAt, session.createdAt)
      : session.createdAt;
    map.set(rootPath, {
      id: rootPath,
      name: workspaceNameFromPath(rootPath),
      pathHint: rootPath,
      createdAt,
      lastOpenedAt,
    });
  }
  return Array.from(map.values()).sort((a, b) => b.lastOpenedAt - a.lastOpenedAt);
}

export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const [activeWorkspaceId, setActiveWorkspaceId] = React.useState<string | null>(
    readActiveWorkspace
  );

  const { data: sessions = [] } = useQuery({
    queryKey: ["cowork", "sessions"],
    queryFn: listSessions,
    refetchInterval: config.sessionPollInterval,
  });

  const rawSessions = sessions as CoworkSession[];
  const sessionItems = React.useMemo(() => rawSessions.map(mapSession), [rawSessions]);
  const workspaces = React.useMemo(() => buildWorkspaces(rawSessions), [rawSessions]);

  React.useEffect(() => {
    writeActiveWorkspace(activeWorkspaceId);
  }, [activeWorkspaceId]);

  const createSessionForPath = React.useCallback(
    async (path: string, title?: string) => {
      const session = await createSessionApi({
        grants: [
          {
            rootPath: path,
            allowWrite: true,
            allowCreate: true,
            allowDelete: false,
          },
        ],
      });
      queryClient.invalidateQueries({ queryKey: ["cowork", "sessions"] });
      const mapped = mapSession(session);
      if (title) {
        mapped.title = title;
      }
      setActiveWorkspaceId(mapped.workspaceId);
      return mapped;
    },
    [queryClient]
  );

  const getWorkspace = React.useCallback(
    (workspaceId: string) => workspaces.find((item) => item.id === workspaceId) ?? null,
    [workspaces]
  );

  const getSession = React.useCallback(
    (sessionId: string) => sessionItems.find((item) => item.id === sessionId) ?? null,
    [sessionItems]
  );

  const getSessionsForWorkspace = React.useCallback(
    (workspaceId: string) => sessionItems.filter((item) => item.workspaceId === workspaceId),
    [sessionItems]
  );

  const refreshSessions = React.useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["cowork", "sessions"] });
  }, [queryClient]);

  const value = React.useMemo<WorkspaceContextValue>(
    () => ({
      workspaces,
      sessions: sessionItems,
      activeWorkspaceId,
      setActiveWorkspace: setActiveWorkspaceId,
      createSessionForPath,
      getWorkspace,
      getSession,
      getSessionsForWorkspace,
      refreshSessions,
    }),
    [
      workspaces,
      sessionItems,
      activeWorkspaceId,
      createSessionForPath,
      getWorkspace,
      getSession,
      getSessionsForWorkspace,
      refreshSessions,
    ]
  );

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace(): WorkspaceContextValue {
  const context = React.useContext(WorkspaceContext);
  if (!context) {
    throw new Error("useWorkspace must be used within WorkspaceProvider");
  }
  return context;
}
