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
import { useCurrentUser } from "../../hooks/useCurrentUser";
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
  createProject: (
    name: string,
    options?: { instructions?: string; workspaceId?: string | null }
  ) => Promise<Project>;
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

function mapProject(project: CoworkProject, workspaces: Workspace[]): Project {
  const metadata = project.metadata;
  const record =
    metadata && typeof metadata === "object" ? (metadata as Record<string, unknown>) : {};
  const workspaceId = typeof record.workspaceId === "string" ? record.workspaceId : undefined;
  const instructions = typeof record.instructions === "string" ? record.instructions : undefined;
  const inferredWorkspaceId =
    workspaceId ??
    (project.pathHint
      ? workspaces.find((workspace) => workspace.id === project.pathHint)?.id
      : undefined);

  return {
    id: project.projectId,
    name: project.name,
    workspaceId: inferredWorkspaceId,
    description: project.description,
    createdAt: project.createdAt,
    instructions,
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
  const { data: currentUser } = useCurrentUser();
  const userId = currentUser?.id;
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

  const { data: projectsRaw = [], isFetched: projectsFetched } = useQuery({
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
  const projects = React.useMemo(
    () => projectsRaw.map((project) => mapProject(project, workspaces)),
    [projectsRaw, workspaces]
  );

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

  const hydratedProjectWorkspaceRef = React.useRef(false);

  React.useEffect(() => {
    if (hydratedProjectWorkspaceRef.current || !projectsFetched) {
      return;
    }
    if (!activeProjectId) {
      hydratedProjectWorkspaceRef.current = true;
      return;
    }
    const project = projects.find((item) => item.id === activeProjectId);
    if (!project) {
      setActiveProjectId(null);
      hydratedProjectWorkspaceRef.current = true;
      return;
    }
    if (project.workspaceId) {
      setActiveWorkspaceId(project.workspaceId);
    } else {
      setActiveWorkspaceId(null);
    }
    hydratedProjectWorkspaceRef.current = true;
  }, [activeProjectId, projects, projectsFetched]);

  const createSessionForPath = React.useCallback(
    async (path: string, title?: string) => {
      const session = await createSessionApi({
        title,
        userId,
        grants: [
          {
            rootPath: path,
            allowWrite: true,
            allowCreate: true,
            allowDelete: false,
          },
        ],
      });

      let updatedSession = session;
      if (activeProjectId) {
        const activeProject = projects.find((project) => project.id === activeProjectId);
        if (activeProject?.workspaceId === path) {
          updatedSession = await updateSession(session.sessionId, { projectId: activeProjectId });
        }
      }

      pushSession(updatedSession);
      const mapped = mapSession(updatedSession);
      if (title) {
        mapped.title = title;
      }
      setActiveWorkspaceId(mapped.workspaceId);
      return mapped;
    },
    [activeProjectId, projects, pushSession, userId]
  );

  const createSessionWithoutGrant = React.useCallback(
    async (title?: string) => {
      const session = await createSessionApi({ title, userId });
      const activeProject = activeProjectId
        ? projects.find((project) => project.id === activeProjectId)
        : undefined;
      if (activeProject && !activeProject.workspaceId) {
        await updateSession(session.sessionId, { projectId: activeProjectId });
        session.projectId = activeProjectId ?? undefined;
      }

      pushSession(session);
      return mapSession(session);
    },
    [activeProjectId, projects, pushSession, userId]
  );

  const createProject = React.useCallback(
    async (name: string, options?: { instructions?: string; workspaceId?: string | null }) => {
      const metadata: Record<string, unknown> = {};
      const instructions = options?.instructions?.trim();
      if (instructions) {
        metadata.instructions = instructions;
      }
      if (options?.workspaceId) {
        metadata.workspaceId = options.workspaceId;
      }

      const project = await createProjectApi({
        name,
        metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
      });
      queryClient.invalidateQueries({ queryKey: ["cowork", "projects"] });
      setActiveProjectId(project.projectId);
      if (options?.workspaceId) {
        setActiveWorkspaceId(options.workspaceId);
      }
      return mapProject(project, workspaces);
    },
    [queryClient, workspaces]
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

  const setActiveWorkspace = React.useCallback(
    (workspaceId: string | null) => {
      setActiveWorkspaceId(workspaceId);
      if (!workspaceId || !activeProjectId) {
        return;
      }
      const project = projects.find((item) => item.id === activeProjectId);
      if (!project || project.workspaceId !== workspaceId) {
        setActiveProjectId(null);
      }
    },
    [activeProjectId, projects]
  );

  const setActiveProject = React.useCallback(
    (projectId: string | null) => {
      setActiveProjectId(projectId);
      if (!projectId) {
        return;
      }
      const project = projects.find((item) => item.id === projectId);
      if (!project) {
        return;
      }
      if (project.workspaceId) {
        setActiveWorkspaceId(project.workspaceId);
      } else {
        setActiveWorkspaceId(null);
      }
    },
    [projects]
  );

  const value = React.useMemo<WorkspaceContextValue>(
    () => ({
      workspaces,
      sessions: sessionItems,
      projects,
      activeWorkspaceId,
      activeProjectId,
      setActiveWorkspace,
      setActiveProject,
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
      setActiveWorkspace,
      setActiveProject,
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
