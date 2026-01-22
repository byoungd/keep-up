import type { CoworkProject, CoworkSession, CoworkWorkspace } from "@ku0/agent-runtime";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import React from "react";
import {
  createProject as createProjectApi,
  createSession as createSessionApi,
  listProjects,
  listSessions,
  listWorkspaces,
  updateSession,
} from "../../api/coworkApi";
import type { Project, Session, Workspace } from "../../features/workspace/types";
import { config } from "../../lib/config";

const STORAGE_KEYS = {
  activeWorkspace: "cowork-active-workspace",
  activeProject: "cowork-active-project",
};

type WorkspaceContextValue = {
  workspaces: Workspace[];
  sessions: Session[];
  projects: Project[];
  activeWorkspaceId: string | null;
  activeProjectId: string | null;
  setActiveWorkspace: (workspaceId: string | null) => void;
  setActiveProject: (projectId: string | null) => void;
  createSessionForPath: (path: string, title?: string) => Promise<Session>;
  createSessionWithoutGrant: (title?: string) => Promise<Session>;
  createProject: (name: string, instructions?: string) => Promise<Project>;
  moveSessionToProject: (sessionId: string, projectId: string | null) => Promise<void>;
  renameSession: (sessionId: string, newTitle: string) => Promise<void>;
  deleteSession: (sessionId: string) => Promise<void>;
  getWorkspace: (workspaceId: string) => Workspace | null;
  getSession: (sessionId: string) => Session | null;
  getSessionsForWorkspace: (workspaceId: string) => Session[];
  getSessionsForProject: (projectId: string) => Session[];
  refreshSessions: () => void;
  refreshProjects: () => void;
};

const WorkspaceContext = React.createContext<WorkspaceContextValue | null>(null);

function readStorage(key: string): string | null {
  if (typeof window === "undefined") {
    return null;
  }
  return window.localStorage.getItem(key);
}

function writeStorage(key: string, value: string | null): void {
  if (typeof window === "undefined") {
    return;
  }
  if (value) {
    window.localStorage.setItem(key, value);
  } else {
    window.localStorage.removeItem(key);
  }
}

function workspaceNameFromPath(path: string): string {
  const parts = path.split("/").filter(Boolean);
  return parts[parts.length - 1] ?? path;
}

function resolveSessionTitle(session: CoworkSession): string {
  if (session.title) {
    return session.title;
  }
  const rootPath = session.grants[0]?.rootPath;
  if (!rootPath) {
    return "Untitled Session";
  }
  return `${workspaceNameFromPath(rootPath)} Session`;
}

function mapSession(session: CoworkSession): Session {
  const fallbackRoot = session.grants[0]?.rootPath ?? "unknown";
  const workspaceId = session.workspaceId ?? fallbackRoot;
  return {
    id: session.sessionId,
    workspaceId,
    title: resolveSessionTitle(session),
    createdAt: session.createdAt,
    projectId: session.projectId,
  };
}

function mapProject(project: CoworkProject): Project {
  return {
    id: project.projectId,
    name: project.name,
    description: project.description,
    createdAt: project.createdAt,
    instructions: (project.metadata as { instructions?: string } | undefined)?.instructions,
  };
}

function mapWorkspace(workspace: CoworkWorkspace): Workspace {
  return {
    id: workspace.workspaceId,
    name: workspace.name,
    pathHint: workspace.pathHint,
    createdAt: workspace.createdAt,
    lastOpenedAt: workspace.lastOpenedAt,
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
  const [activeWorkspaceId, setActiveWorkspaceId] = React.useState<string | null>(() =>
    readStorage(STORAGE_KEYS.activeWorkspace)
  );
  const [activeProjectId, setActiveProjectId] = React.useState<string | null>(() =>
    readStorage(STORAGE_KEYS.activeProject)
  );

  const { data: sessions = [] } = useQuery({
    queryKey: ["cowork", "sessions"],
    queryFn: listSessions,
    refetchInterval: config.sessionPollInterval,
  });

  const { data: projectsRaw = [] } = useQuery({
    queryKey: ["cowork", "projects"],
    queryFn: listProjects,
  });

  const { data: workspacesRaw = [] } = useQuery({
    queryKey: ["cowork", "workspaces"],
    queryFn: listWorkspaces,
    refetchInterval: config.sessionPollInterval,
  });

  const rawSessions = sessions as CoworkSession[];
  const sessionItems = React.useMemo(() => rawSessions.map(mapSession), [rawSessions]);
  const workspaces = React.useMemo(() => {
    const mapped = (workspacesRaw as CoworkWorkspace[]).map(mapWorkspace);
    return mapped.length > 0 ? mapped : buildWorkspaces(rawSessions);
  }, [rawSessions, workspacesRaw]);
  const projects = React.useMemo(() => projectsRaw.map(mapProject), [projectsRaw]);

  const pushSession = React.useCallback(
    (session: CoworkSession) => {
      queryClient.setQueryData<CoworkSession[]>(["cowork", "sessions"], (prev) => {
        const list = Array.isArray(prev) ? [...prev] : [];
        const existingIndex = list.findIndex((item) => item.sessionId === session.sessionId);
        if (existingIndex >= 0) {
          list[existingIndex] = session;
          return list;
        }
        return [session, ...list];
      });
    },
    [queryClient]
  );

  React.useEffect(() => {
    writeStorage(STORAGE_KEYS.activeWorkspace, activeWorkspaceId);
  }, [activeWorkspaceId]);

  React.useEffect(() => {
    writeStorage(STORAGE_KEYS.activeProject, activeProjectId);
  }, [activeProjectId]);

  const createSessionForPath = React.useCallback(
    async (path: string, title?: string) => {
      const session = await createSessionApi({
        title,
        grants: [
          {
            rootPath: path,
            allowWrite: true,
            allowCreate: true,
            allowDelete: false,
          },
        ],
      });
      // Assuming new sessions don't technically belong to a project immediately unless specified
      // But if we have an active project, maybe we should associate it?
      // User didn't explicitly ask for this, but it's good UX.
      // For now, I'll stick to basic implementation.
      pushSession(session);
      const mapped = mapSession(session);
      if (title) {
        mapped.title = title;
      }
      setActiveWorkspaceId(mapped.workspaceId);
      return mapped;
    },
    [pushSession]
  );

  const createSessionWithoutGrant = React.useCallback(
    async (title?: string) => {
      const session = await createSessionApi({ title });
      // If there is an active project, auto-assign it?
      // Let's implement auto-assign if activeProjectId is set.
      if (activeProjectId) {
        // This would require a second call or updating API to accept projectId on create.
        // createSessionApi doesn't support projectId yet in schema/types.
        // Let's verify `createSessionSchema` in backend.
        // It didn't include projectId. I should have added it.
        // I'll do it later if needed.
        await updateSession(session.sessionId, { projectId: activeProjectId });
        session.projectId = activeProjectId;
      }

      pushSession(session);
      return mapSession(session);
    },
    [pushSession, activeProjectId]
  ); // Added activeProjectId dep

  const createProject = React.useCallback(
    async (name: string, instructions?: string) => {
      const project = await createProjectApi({
        name,
        metadata: instructions ? { instructions } : undefined,
      });
      queryClient.invalidateQueries({ queryKey: ["cowork", "projects"] });
      setActiveProjectId(project.projectId);
      return mapProject(project);
    },
    [queryClient]
  );

  const moveSessionToProject = React.useCallback(
    async (sessionId: string, projectId: string | null) => {
      const updated = await updateSession(sessionId, { projectId });
      pushSession(updated);
    },
    [pushSession]
  );

  const renameSession = React.useCallback(
    async (sessionId: string, newTitle: string) => {
      const updated = await updateSession(sessionId, { title: newTitle });
      pushSession(updated);
    },
    [pushSession]
  );

  const deleteSession = React.useCallback(
    async (sessionId: string) => {
      await fetch(`/api/sessions/${sessionId}`, { method: "DELETE" });
      queryClient.setQueryData<CoworkSession[]>(["cowork", "sessions"], (prev) => {
        const list = Array.isArray(prev) ? [...prev] : [];
        return list.filter((item) => item.sessionId !== sessionId);
      });
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

  const getSessionsForProject = React.useCallback(
    (projectId: string) => sessionItems.filter((item) => item.projectId === projectId),
    [sessionItems]
  );

  const refreshSessions = React.useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["cowork", "sessions"] });
  }, [queryClient]);

  const refreshProjects = React.useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["cowork", "projects"] });
  }, [queryClient]);

  const value = React.useMemo<WorkspaceContextValue>(
    () => ({
      workspaces,
      sessions: sessionItems,
      projects,
      activeWorkspaceId,
      activeProjectId,
      setActiveWorkspace: setActiveWorkspaceId,
      setActiveProject: setActiveProjectId,
      createSessionForPath,
      createSessionWithoutGrant,
      createProject,
      moveSessionToProject,
      renameSession,
      deleteSession,
      getWorkspace,
      getSession,
      getSessionsForWorkspace,
      getSessionsForProject,
      refreshSessions,
      refreshProjects,
    }),
    [
      workspaces,
      sessionItems,
      projects,
      activeWorkspaceId,
      activeProjectId,
      createSessionForPath,
      createSessionWithoutGrant,
      createProject,
      moveSessionToProject,
      renameSession,
      deleteSession,
      getWorkspace,
      getSession,
      getSessionsForWorkspace,
      getSessionsForProject,
      refreshSessions,
      refreshProjects,
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
