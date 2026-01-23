"use client";

import { cn } from "@ku0/shared/utils";
import {
  Button,
  Dialog,
  DialogFooter,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
  Input,
  Select,
  SelectOption,
  Tooltip,
  useShellComponents,
  useShellRouter,
} from "@ku0/shell";
import {
  Brain,
  Check,
  ChevronDown,
  ExternalLink,
  Folder,
  FolderPlus,
  LayoutGrid,
  ListFilter,
  ListTodo,
  MoreHorizontal,
  PencilLine,
  Pin,
  PinOff,
  Plus,
  Search,
  Share2,
  Sparkles,
  Star,
  Trash2,
  X,
} from "lucide-react";
import * as React from "react";
import { useWorkspace } from "../../app/providers/WorkspaceProvider";
import type { Project, Session, Workspace } from "../../features/workspace/types";
import { shareSessionLink } from "../../lib/shareSession";

type TaskFilter = "all" | "favorites";

const FAVORITES_STORAGE_KEY = "cowork-task-favorites-v1";
const PINNED_PROJECTS_STORAGE_KEY = "cowork-pinned-projects-v1";
const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;

function bucketSessionsByRecency(sessions: Session[]) {
  const now = Date.now();
  const today: Session[] = [];
  const recent: Session[] = [];
  const archive: Session[] = [];

  for (const session of sessions) {
    const age = now - session.createdAt;
    if (age <= DAY_MS) {
      today.push(session);
    } else if (age <= WEEK_MS) {
      recent.push(session);
    } else {
      archive.push(session);
    }
  }

  return { today, recent, archive };
}

function readStorageSet(key: string): Set<string> {
  if (typeof window === "undefined") {
    return new Set();
  }
  try {
    const stored = window.localStorage.getItem(key);
    const parsed = stored ? (JSON.parse(stored) as string[]) : [];
    return new Set(Array.isArray(parsed) ? parsed : []);
  } catch {
    return new Set();
  }
}

function writeStorageSet(key: string, ids: Set<string>): void {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(key, JSON.stringify(Array.from(ids)));
}

export function CoworkSidebarSections() {
  const {
    sessions,
    projects,
    workspaces,
    activeProjectId,
    setActiveProject,
    activeWorkspaceId,
    setActiveWorkspace,
    createProject,
    moveSessionToProject,
    renameSession,
    deleteSession,
    getSessionsForWorkspace,
  } = useWorkspace();

  return (
    <div className="space-y-2">
      <SpacesSection
        workspaces={workspaces}
        totalSessions={sessions.length}
        activeWorkspaceId={activeWorkspaceId}
        setActiveWorkspace={setActiveWorkspace}
        getSessionsForWorkspace={getSessionsForWorkspace}
      />
      <ProjectsSection
        projects={projects}
        workspaces={workspaces}
        activeWorkspaceId={activeWorkspaceId}
        activeProjectId={activeProjectId}
        setActiveProject={setActiveProject}
        createProject={createProject}
      />
      <TasksSection
        sessions={sessions}
        projects={projects}
        workspaces={workspaces}
        activeProjectId={activeProjectId}
        setActiveProject={setActiveProject}
        activeWorkspaceId={activeWorkspaceId}
        setActiveWorkspace={setActiveWorkspace}
        moveSessionToProject={moveSessionToProject}
        renameSession={renameSession}
        deleteSession={deleteSession}
      />
    </div>
  );
}

type SpacesSectionProps = {
  workspaces: Workspace[];
  totalSessions: number;
  activeWorkspaceId: string | null;
  setActiveWorkspace: (workspaceId: string | null) => void;
  getSessionsForWorkspace: (workspaceId: string) => Session[];
};

function SpacesSection({
  workspaces,
  totalSessions,
  activeWorkspaceId,
  setActiveWorkspace,
  getSessionsForWorkspace,
}: SpacesSectionProps) {
  const router = useShellRouter();
  const [isExpanded, setIsExpanded] = React.useState(true);

  const sortedWorkspaces = React.useMemo(
    () => [...workspaces].sort((a, b) => b.lastOpenedAt - a.lastOpenedAt),
    [workspaces]
  );

  const sessionCounts = React.useMemo(() => {
    const counts = new Map<string, number>();
    for (const workspace of workspaces) {
      counts.set(workspace.id, getSessionsForWorkspace(workspace.id).length);
    }
    return counts;
  }, [workspaces, getSessionsForWorkspace]);

  const handleNewSpace = React.useCallback(() => {
    router.push("/new-session");
  }, [router]);

  return (
    <section className="space-y-1">
      <div className="flex items-center justify-between rounded-md px-3 py-1.5 group hover:bg-surface-hover transition-colors duration-fast">
        <button
          type="button"
          className="flex flex-1 items-center gap-2 text-left text-fine font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors duration-fast cursor-pointer"
          aria-label="Workspaces section"
          aria-expanded={isExpanded}
          onClick={() => setIsExpanded((prev) => !prev)}
        >
          <span>Workspaces</span>
          <ChevronDown
            className={cn(
              "h-3 w-3 opacity-0 group-hover:opacity-100 transition-all duration-fast",
              !isExpanded && "-rotate-90"
            )}
          />
        </button>
        <Tooltip content="New workspace" side="top">
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 rounded-md text-muted-foreground hover:text-foreground hover:bg-surface-hover"
            aria-label="New workspace"
            onClick={handleNewSpace}
          >
            <Plus className="h-4 w-4" />
          </Button>
        </Tooltip>
      </div>

      <div
        className={cn(
          "space-y-1 overflow-hidden transition-all duration-200 ease-out",
          isExpanded
            ? "max-h-[1000px] opacity-100 translate-y-0"
            : "max-h-0 opacity-0 -translate-y-1 pointer-events-none"
        )}
        aria-hidden={!isExpanded}
      >
        <SpaceRow
          label="All Workspaces"
          isActive={!activeWorkspaceId}
          count={totalSessions}
          onSelect={() => setActiveWorkspace(null)}
          icon={<LayoutGrid className="h-4 w-4" aria-hidden="true" />}
        />

        {sortedWorkspaces.map((workspace) => (
          <SpaceRow
            key={workspace.id}
            label={workspace.name}
            title={workspace.pathHint ?? workspace.name}
            isActive={activeWorkspaceId === workspace.id}
            count={sessionCounts.get(workspace.id) ?? 0}
            onSelect={() => setActiveWorkspace(workspace.id)}
            icon={<Folder className="h-4 w-4" aria-hidden="true" />}
          />
        ))}
      </div>
    </section>
  );
}

type SpaceRowProps = {
  label: string;
  title?: string;
  isActive: boolean;
  count: number;
  icon: React.ReactNode;
  onSelect: () => void;
};

function SpaceRow({ label, title, isActive, count, icon, onSelect }: SpaceRowProps) {
  return (
    <button
      type="button"
      title={title ?? label}
      onClick={onSelect}
      className={cn(
        "flex items-center gap-2.5 w-full rounded-md px-3 py-1.5 text-[13px] transition-colors duration-fast",
        isActive
          ? "bg-foreground/[0.08] text-foreground font-medium"
          : "text-muted-foreground hover:bg-surface-hover hover:text-foreground"
      )}
    >
      {icon}
      <span className="truncate flex-1 text-left">{label}</span>
      <span className="text-[10px] font-semibold text-muted-foreground/70">{count}</span>
    </button>
  );
}

type ProjectsSectionProps = {
  projects: Project[];
  workspaces: Workspace[];
  activeWorkspaceId: string | null;
  activeProjectId: string | null;
  setActiveProject: (projectId: string | null) => void;
  createProject: (
    name: string,
    options?: { instructions?: string; workspaceId?: string | null }
  ) => Promise<Project>;
};

function ProjectsSection({
  projects,
  workspaces,
  activeWorkspaceId,
  activeProjectId,
  setActiveProject,
  createProject,
}: ProjectsSectionProps) {
  const [isDialogOpen, setIsDialogOpen] = React.useState(false);
  const [projectName, setProjectName] = React.useState("");
  const [projectInstructions, setProjectInstructions] = React.useState("");
  const [selectedWorkspaceId, setSelectedWorkspaceId] = React.useState("");
  const [isProjectsExpanded, setIsProjectsExpanded] = React.useState(true);
  const [pinnedProjectIds, setPinnedProjectIds] = React.useState<Set<string>>(new Set());
  const sortedWorkspaces = React.useMemo(
    () => [...workspaces].sort((a, b) => b.lastOpenedAt - a.lastOpenedAt),
    [workspaces]
  );
  const workspaceLabelMap = React.useMemo(
    () => new Map(workspaces.map((workspace) => [workspace.id, workspace.name])),
    [workspaces]
  );

  React.useEffect(() => {
    setPinnedProjectIds(readStorageSet(PINNED_PROJECTS_STORAGE_KEY));
  }, []);

  React.useEffect(() => {
    if (!isDialogOpen) {
      return;
    }
    if (activeWorkspaceId) {
      setSelectedWorkspaceId(activeWorkspaceId);
      return;
    }
    setSelectedWorkspaceId(sortedWorkspaces[0]?.id ?? "");
  }, [activeWorkspaceId, isDialogOpen, sortedWorkspaces]);

  const scopedProjects = React.useMemo(() => {
    if (!activeWorkspaceId) {
      return projects;
    }
    return projects.filter(
      (project) => project.workspaceId === activeWorkspaceId || !project.workspaceId
    );
  }, [projects, activeWorkspaceId]);

  const sortedProjects = React.useMemo(() => {
    return [...scopedProjects].sort((a, b) => {
      const aPinned = pinnedProjectIds.has(a.id);
      const bPinned = pinnedProjectIds.has(b.id);
      if (aPinned && !bPinned) {
        return -1;
      }
      if (!aPinned && bPinned) {
        return 1;
      }
      return b.createdAt - a.createdAt;
    });
  }, [scopedProjects, pinnedProjectIds]);
  const workspaceProjects = React.useMemo(() => {
    if (!activeWorkspaceId) {
      return [];
    }
    return sortedProjects.filter((project) => project.workspaceId === activeWorkspaceId);
  }, [sortedProjects, activeWorkspaceId]);
  const unassignedProjects = React.useMemo(
    () => sortedProjects.filter((project) => !project.workspaceId),
    [sortedProjects]
  );

  const handleSelectProject = React.useCallback(
    (projectId: string) => {
      if (activeProjectId === projectId) {
        setActiveProject(null);
      } else {
        setActiveProject(projectId);
      }
    },
    [activeProjectId, setActiveProject]
  );

  const handleCreateProject = React.useCallback(async () => {
    const trimmedName = projectName.trim();
    if (!trimmedName || !selectedWorkspaceId) {
      return;
    }

    try {
      await createProject(trimmedName, {
        instructions: projectInstructions.trim() || undefined,
        workspaceId: selectedWorkspaceId,
      });
      setProjectName("");
      setProjectInstructions("");
      setIsDialogOpen(false);
    } catch (_err) {
      void _err;
    }
  }, [projectInstructions, projectName, selectedWorkspaceId, createProject]);

  const togglePinProject = React.useCallback((projectId: string) => {
    setPinnedProjectIds((prev) => {
      const next = new Set(prev);
      if (next.has(projectId)) {
        next.delete(projectId);
      } else {
        next.add(projectId);
      }
      writeStorageSet(PINNED_PROJECTS_STORAGE_KEY, next);
      return next;
    });
  }, []);

  return (
    <>
      <section className="space-y-1">
        <div className="flex items-center justify-between rounded-md px-3 py-1.5 group hover:bg-surface-hover transition-colors duration-fast">
          <button
            type="button"
            className="flex flex-1 items-center gap-2 text-left text-fine font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors duration-fast cursor-pointer"
            aria-label="Projects section"
            aria-expanded={isProjectsExpanded}
            onClick={() => setIsProjectsExpanded((prev) => !prev)}
          >
            <span>Projects</span>
            <ChevronDown
              className={cn(
                "h-3 w-3 opacity-0 group-hover:opacity-100 transition-all duration-fast",
                !isProjectsExpanded && "-rotate-90"
              )}
            />
          </button>
          <Tooltip content="Create project" side="top">
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 rounded-md text-muted-foreground hover:text-foreground hover:bg-surface-hover"
              aria-label="Create project"
              onClick={() => setIsDialogOpen(true)}
            >
              <Plus className="h-4 w-4" />
            </Button>
          </Tooltip>
        </div>

        <div
          className={cn(
            "space-y-1 overflow-hidden transition-all duration-200 ease-out",
            isProjectsExpanded
              ? "max-h-[1000px] opacity-100 translate-y-0"
              : "max-h-0 opacity-0 -translate-y-1 pointer-events-none"
          )}
          aria-hidden={!isProjectsExpanded}
        >
          {activeWorkspaceId ? (
            <>
              {workspaceProjects.length === 0 && unassignedProjects.length === 0 ? (
                <button
                  type="button"
                  className="flex items-center gap-2.5 w-full rounded-md px-3 py-1.5 text-[13px] text-muted-foreground hover:text-foreground hover:bg-surface-hover transition-colors duration-fast cursor-pointer group"
                  onClick={() => setIsDialogOpen(true)}
                >
                  <FolderPlus
                    className="h-4 w-4 text-muted-foreground opacity-70 group-hover:opacity-100 group-hover:text-foreground transition-all duration-fast"
                    aria-hidden="true"
                  />
                  <span>New project</span>
                </button>
              ) : null}

              {workspaceProjects.map((project) => (
                <ProjectRow
                  key={project.id}
                  project={project}
                  isActive={activeProjectId === project.id}
                  isPinned={pinnedProjectIds.has(project.id)}
                  onSelect={() => handleSelectProject(project.id)}
                  onTogglePin={() => togglePinProject(project.id)}
                />
              ))}

              {unassignedProjects.length > 0 ? (
                <div className="px-3 pt-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground/70">
                  Unassigned
                </div>
              ) : null}
              {unassignedProjects.map((project) => (
                <ProjectRow
                  key={project.id}
                  project={project}
                  isActive={activeProjectId === project.id}
                  isPinned={pinnedProjectIds.has(project.id)}
                  workspaceLabel="Unassigned"
                  onSelect={() => handleSelectProject(project.id)}
                  onTogglePin={() => togglePinProject(project.id)}
                />
              ))}
            </>
          ) : (
            <>
              {sortedProjects.length === 0 ? (
                <button
                  type="button"
                  className="flex items-center gap-2.5 w-full rounded-md px-3 py-1.5 text-[13px] text-muted-foreground hover:text-foreground hover:bg-surface-hover transition-colors duration-fast cursor-pointer group"
                  onClick={() => setIsDialogOpen(true)}
                >
                  <FolderPlus
                    className="h-4 w-4 text-muted-foreground opacity-70 group-hover:opacity-100 group-hover:text-foreground transition-all duration-fast"
                    aria-hidden="true"
                  />
                  <span>New project</span>
                </button>
              ) : null}

              {sortedProjects.map((project) => (
                <ProjectRow
                  key={project.id}
                  project={project}
                  isActive={activeProjectId === project.id}
                  isPinned={pinnedProjectIds.has(project.id)}
                  workspaceLabel={
                    project.workspaceId ? workspaceLabelMap.get(project.workspaceId) : "Unassigned"
                  }
                  onSelect={() => handleSelectProject(project.id)}
                  onTogglePin={() => togglePinProject(project.id)}
                />
              ))}
            </>
          )}
        </div>
      </section>

      <Dialog
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        title="Create project"
        className="rounded-3xl bg-surface-1/95 border-border/30"
      >
        <div className="space-y-5">
          <div className="flex justify-center">
            <div className="h-12 w-12 rounded-2xl bg-foreground/[0.05] border border-border/40 flex items-center justify-center text-muted-foreground">
              <Folder className="h-6 w-6" aria-hidden="true" />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground" htmlFor="project-name">
              Project name
            </label>
            <Input
              id="project-name"
              placeholder="Enter the name"
              value={projectName}
              onChange={(event) => setProjectName(event.target.value)}
              aria-label="Project name"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground" htmlFor="project-workspace">
              Workspace
            </label>
            <Select
              id="project-workspace"
              value={selectedWorkspaceId}
              onChange={(event) => setSelectedWorkspaceId(event.target.value)}
              aria-label="Project workspace"
              fullWidth
            >
              <SelectOption value="" disabled>
                Select a workspace
              </SelectOption>
              {sortedWorkspaces.map((workspace) => (
                <SelectOption key={workspace.id} value={workspace.id}>
                  {workspace.name}
                </SelectOption>
              ))}
            </Select>
            {sortedWorkspaces.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                Start a session to create your first workspace.
              </p>
            ) : null}
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground" htmlFor="project-instructions">
              Instructions <span className="text-muted-foreground">(optional)</span>
            </label>
            <textarea
              id="project-instructions"
              aria-label="Project instructions"
              placeholder='e.g. "Focus on Python best practices"'
              value={projectInstructions}
              onChange={(event) => setProjectInstructions(event.target.value)}
              className="min-h-[140px] w-full rounded-xl border border-border/40 bg-surface-2/40 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            />
          </div>
        </div>

        <DialogFooter className="bg-transparent border-none px-0 -mx-0 mt-6">
          <Button
            variant="secondary"
            onClick={() => {
              setIsDialogOpen(false);
              setProjectName("");
              setProjectInstructions("");
            }}
            type="button"
          >
            Cancel
          </Button>
          <Button
            onClick={handleCreateProject}
            type="button"
            disabled={!projectName.trim() || !selectedWorkspaceId}
            className="min-w-[96px]"
          >
            Create
          </Button>
        </DialogFooter>
      </Dialog>
    </>
  );
}

type ProjectRowProps = {
  project: Project;
  isActive: boolean;
  isPinned: boolean;
  workspaceLabel?: string;
  onSelect: () => void;
  onTogglePin: () => void;
};

function ProjectRow({
  project,
  isActive,
  isPinned,
  workspaceLabel,
  onSelect,
  onTogglePin,
}: ProjectRowProps) {
  return (
    <div className="space-y-0.5">
      <div
        className={cn(
          "group relative flex items-center rounded-md px-3 py-1.5 transition-colors duration-fast",
          isActive
            ? "bg-foreground/[0.08] text-foreground font-medium"
            : "text-muted-foreground hover:bg-surface-hover hover:text-foreground"
        )}
      >
        <button
          type="button"
          onClick={onSelect}
          className="flex flex-1 items-center gap-2.5 min-w-0 text-[13px] text-left cursor-pointer outline-none pl-0.5"
        >
          <Folder
            className={cn(
              "h-4 w-4 shrink-0 transition-all duration-fast",
              isActive
                ? "text-foreground"
                : "text-muted-foreground opacity-70 group-hover:opacity-100 group-hover:text-foreground"
            )}
            aria-hidden="true"
          />
          <span className="truncate flex-1">{project.name}</span>
          {workspaceLabel ? (
            <span className="text-[10px] font-semibold text-muted-foreground/60 shrink-0">
              {workspaceLabel}
            </span>
          ) : null}
          {isPinned ? (
            <Pin className="h-3 w-3 text-muted-foreground/60" aria-hidden="true" />
          ) : null}
        </button>

        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className={cn(
                "absolute right-1 top-1/2 h-6 w-6 -translate-y-1/2 rounded-md",
                "text-muted-foreground hover:text-foreground",
                "bg-surface-2 shadow-sm border border-border/20",
                "transition-opacity opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto",
                "focus-visible:opacity-100 focus-visible:pointer-events-auto",
                "data-[state=open]:opacity-100 data-[state=open]:pointer-events-auto data-[state=open]:bg-surface-3"
              )}
              aria-label="Project actions"
            >
              <MoreHorizontal className="h-3.5 w-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="start"
            side="right"
            sideOffset={6}
            className="w-48 rounded-lg p-1"
          >
            <DropdownMenuItem
              onSelect={onTogglePin}
              className="gap-2.5 rounded-md px-3 py-1.5 text-[13px] focus:bg-surface-hover focus:text-foreground cursor-pointer outline-none"
            >
              {isPinned ? (
                <>
                  <PinOff className="h-3.5 w-3.5" />
                  <span>Unpin</span>
                </>
              ) : (
                <>
                  <Pin className="h-3.5 w-3.5" />
                  <span>Pin</span>
                </>
              )}
            </DropdownMenuItem>
            <DropdownMenuItem className="gap-2.5 rounded-md px-3 py-1.5 text-[13px] focus:bg-surface-hover focus:text-foreground cursor-pointer outline-none">
              <PencilLine className="h-3.5 w-3.5" />
              <span>Edit</span>
            </DropdownMenuItem>
            <DropdownMenuSeparator className="mx-1" />
            <DropdownMenuItem className="gap-2.5 rounded-md px-3 py-1.5 text-[13px] text-destructive focus:text-destructive focus:bg-surface-hover cursor-pointer outline-none">
              <Trash2 className="h-3.5 w-3.5" />
              <span>Delete</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

type TasksSectionProps = {
  sessions: Session[];
  projects: Project[];
  workspaces: Workspace[];
  activeProjectId: string | null;
  setActiveProject: (projectId: string | null) => void;
  activeWorkspaceId: string | null;
  setActiveWorkspace: (workspaceId: string | null) => void;
  moveSessionToProject: (sessionId: string, projectId: string | null) => Promise<void>;
  renameSession: (sessionId: string, newTitle: string) => Promise<void>;
  deleteSession: (sessionId: string) => Promise<void>;
};

function TasksSection({
  sessions,
  projects,
  workspaces,
  activeProjectId,
  setActiveProject,
  activeWorkspaceId,
  setActiveWorkspace,
  moveSessionToProject,
  renameSession,
  deleteSession,
}: TasksSectionProps) {
  const router = useShellRouter();
  const components = useShellComponents();
  const { Link } = components;

  const [isTasksExpanded, setIsTasksExpanded] = React.useState(true);
  const [isFavoritesExpanded, setIsFavoritesExpanded] = React.useState(true);
  const [isTodayExpanded, setIsTodayExpanded] = React.useState(true);
  const [isRecentExpanded, setIsRecentExpanded] = React.useState(true);
  const [isArchiveExpanded, setIsArchiveExpanded] = React.useState(false);
  const [taskFilter, setTaskFilter] = React.useState<TaskFilter>("all");
  const [sessionQuery, setSessionQuery] = React.useState("");
  const [favoriteIds, setFavoriteIds] = React.useState<Set<string>>(new Set());
  const [pendingRenameSessionId, setPendingRenameSessionId] = React.useState<string | null>(null);
  const [renameValue, setRenameValue] = React.useState("");
  const [pendingDeleteSessionId, setPendingDeleteSessionId] = React.useState<string | null>(null);

  const renameInputRef = React.useRef<HTMLInputElement | null>(null);
  const { shareFeedback, handleShareSession } = useShareFeedback();

  React.useEffect(() => {
    setFavoriteIds(readStorageSet(FAVORITES_STORAGE_KEY));
  }, []);

  React.useEffect(() => {
    if (!pendingRenameSessionId) {
      return;
    }
    const rafId = requestAnimationFrame(() => {
      renameInputRef.current?.focus();
    });
    return () => cancelAnimationFrame(rafId);
  }, [pendingRenameSessionId]);

  const sortedSessions = React.useMemo(
    () => [...sessions].sort((a, b) => b.createdAt - a.createdAt),
    [sessions]
  );

  const sortedProjects = React.useMemo(
    () => [...projects].sort((a, b) => b.createdAt - a.createdAt),
    [projects]
  );

  const activeWorkspace = React.useMemo(() => {
    if (!activeWorkspaceId) {
      return null;
    }
    return workspaces.find((workspace) => workspace.id === activeWorkspaceId) ?? null;
  }, [workspaces, activeWorkspaceId]);

  const activeProject = React.useMemo(() => {
    if (!activeProjectId) {
      return null;
    }
    return projects.find((project) => project.id === activeProjectId) ?? null;
  }, [projects, activeProjectId]);

  const workspaceScopedSessions = React.useMemo(() => {
    if (!activeWorkspaceId) {
      return sortedSessions;
    }
    return sortedSessions.filter((session) => session.workspaceId === activeWorkspaceId);
  }, [sortedSessions, activeWorkspaceId]);

  const projectScopedSessions = React.useMemo(() => {
    if (!activeProjectId) {
      return workspaceScopedSessions;
    }
    return workspaceScopedSessions.filter((session) => session.projectId === activeProjectId);
  }, [workspaceScopedSessions, activeProjectId]);

  const normalizedQuery = sessionQuery.trim().toLowerCase();
  const searchedSessions = React.useMemo(() => {
    if (!normalizedQuery) {
      return projectScopedSessions;
    }
    return projectScopedSessions.filter((session) =>
      session.title.toLowerCase().includes(normalizedQuery)
    );
  }, [projectScopedSessions, normalizedQuery]);

  const favoriteSessions = React.useMemo(
    () => searchedSessions.filter((session) => favoriteIds.has(session.id)),
    [searchedSessions, favoriteIds]
  );

  const nonFavoriteSessions = React.useMemo(() => {
    if (taskFilter === "favorites") {
      return [];
    }
    return searchedSessions.filter((session) => !favoriteIds.has(session.id));
  }, [searchedSessions, favoriteIds, taskFilter]);

  const {
    today: todaySessions,
    recent: recentSessions,
    archive: archivedSessions,
  } = React.useMemo(() => bucketSessionsByRecency(nonFavoriteSessions), [nonFavoriteSessions]);

  const toggleFavorite = React.useCallback((sessionId: string) => {
    setFavoriteIds((prev) => {
      const next = new Set(prev);
      if (next.has(sessionId)) {
        next.delete(sessionId);
      } else {
        next.add(sessionId);
      }
      writeStorageSet(FAVORITES_STORAGE_KEY, next);
      return next;
    });
  }, []);

  const handleOpenInNewTab = React.useCallback((sessionId: string) => {
    if (typeof window === "undefined") {
      return;
    }
    window.open(`/sessions/${sessionId}`, "_blank", "noopener,noreferrer");
  }, []);

  const handleMoveToProject = React.useCallback(
    async (sessionId: string, projectId: string | null) => {
      try {
        await moveSessionToProject(sessionId, projectId);
      } catch (_err) {
        void _err;
      }
    },
    [moveSessionToProject]
  );

  const openRenameDialog = React.useCallback(
    (sessionId: string) => {
      const target = sessions.find((session) => session.id === sessionId);
      setPendingRenameSessionId(sessionId);
      setRenameValue(target?.title ?? "");
    },
    [sessions]
  );

  const closeRenameDialog = React.useCallback(() => {
    setPendingRenameSessionId(null);
    setRenameValue("");
  }, []);

  const confirmRenameSession = React.useCallback(async () => {
    if (!pendingRenameSessionId) {
      return;
    }
    const trimmed = renameValue.trim();
    if (!trimmed) {
      return;
    }
    try {
      await renameSession(pendingRenameSessionId, trimmed);
    } catch (_err) {
      void _err;
    } finally {
      closeRenameDialog();
    }
  }, [pendingRenameSessionId, renameValue, renameSession, closeRenameDialog]);

  const openDeleteDialog = React.useCallback((sessionId: string) => {
    setPendingDeleteSessionId(sessionId);
  }, []);

  const closeDeleteDialog = React.useCallback(() => {
    setPendingDeleteSessionId(null);
  }, []);

  const confirmDeleteSession = React.useCallback(async () => {
    if (!pendingDeleteSessionId) {
      return;
    }
    try {
      await deleteSession(pendingDeleteSessionId);
    } catch (_e) {
      void _e;
    } finally {
      closeDeleteDialog();
    }
  }, [pendingDeleteSessionId, deleteSession, closeDeleteDialog]);

  const pendingRenameSession = React.useMemo(() => {
    if (!pendingRenameSessionId) {
      return null;
    }
    return sessions.find((session) => session.id === pendingRenameSessionId) ?? null;
  }, [pendingRenameSessionId, sessions]);

  const pendingDeleteSession = React.useMemo(() => {
    if (!pendingDeleteSessionId) {
      return null;
    }
    return sessions.find((session) => session.id === pendingDeleteSessionId) ?? null;
  }, [pendingDeleteSessionId, sessions]);

  const activeSessionId = React.useMemo(() => {
    const match = router.pathname.match(/^\/sessions\/([^/]+)/);
    return match?.[1] ?? null;
  }, [router.pathname]);

  const renderSessionRow = React.useCallback(
    (session: Session) => {
      const isActive = activeSessionId === session.id;
      const isFavorite = favoriteIds.has(session.id);
      const favoriteLabel = isFavorite ? "Unpin session" : "Pin session";
      const shareLabel = shareFeedback[session.id];
      const availableProjects = sortedProjects.filter(
        (project) => !project.workspaceId || project.workspaceId === session.workspaceId
      );
      return (
        <SidebarSessionRow
          key={session.id}
          session={session}
          isActive={isActive}
          isFavorite={isFavorite}
          favoriteLabel={favoriteLabel}
          shareLabel={shareLabel}
          projects={availableProjects}
          linkComponent={Link}
          onShare={() => void handleShareSession(session.id, session.title)}
          onRename={() => openRenameDialog(session.id)}
          onToggleFavorite={() => toggleFavorite(session.id)}
          onOpenInNewTab={() => handleOpenInNewTab(session.id)}
          onMoveToProject={(projectId) => handleMoveToProject(session.id, projectId)}
          onDelete={() => openDeleteDialog(session.id)}
        />
      );
    },
    [
      activeSessionId,
      favoriteIds,
      shareFeedback,
      sortedProjects,
      Link,
      handleShareSession,
      openRenameDialog,
      toggleFavorite,
      handleOpenInNewTab,
      handleMoveToProject,
      openDeleteDialog,
    ]
  );

  const handleCreateSession = React.useCallback(() => {
    router.push("/new-session");
  }, [router]);

  return (
    <>
      <section className="space-y-1">
        <TasksHeader
          taskFilter={taskFilter}
          favoritesCount={favoriteSessions.length}
          totalCount={searchedSessions.length}
          isExpanded={isTasksExpanded}
          onToggleExpanded={() => setIsTasksExpanded((prev) => !prev)}
          onSelectFilter={(next) => {
            setTaskFilter(next);
            if (next === "all") {
              setActiveProject(null);
            }
          }}
        />

        <div
          className={cn(
            "space-y-2 overflow-hidden transition-all duration-200 ease-out",
            isTasksExpanded
              ? "max-h-[1000px] opacity-100 translate-y-0"
              : "max-h-0 opacity-0 -translate-y-1 pointer-events-none"
          )}
          aria-hidden={!isTasksExpanded}
        >
          <div className="px-3">
            <Input
              value={sessionQuery}
              onChange={(event) => setSessionQuery(event.target.value)}
              placeholder="Filter sessions..."
              aria-label="Filter sessions"
              leftIcon={<Search className="h-4 w-4" aria-hidden="true" />}
              className="h-8 text-[12px]"
            />
          </div>

          {activeWorkspace || activeProject ? (
            <div className="px-3 space-y-2">
              {activeWorkspace ? (
                <FilterPill
                  icon={<LayoutGrid className="h-3.5 w-3.5" aria-hidden="true" />}
                  label={`Workspace: ${activeWorkspace.name}`}
                  onClear={() => setActiveWorkspace(null)}
                  ariaLabel="Clear workspace filter"
                />
              ) : null}
              {activeProject ? (
                <FilterPill
                  icon={<Folder className="h-3.5 w-3.5" aria-hidden="true" />}
                  label={`Project: ${activeProject.name}`}
                  onClear={() => setActiveProject(null)}
                  ariaLabel="Clear project filter"
                />
              ) : null}
            </div>
          ) : null}

          <SessionGroupsList
            searchedSessions={searchedSessions}
            sessionQuery={sessionQuery}
            activeProjectId={activeProjectId}
            taskFilter={taskFilter}
            favoriteSessions={favoriteSessions}
            todaySessions={todaySessions}
            recentSessions={recentSessions}
            archivedSessions={archivedSessions}
            isFavoritesExpanded={isFavoritesExpanded}
            setIsFavoritesExpanded={setIsFavoritesExpanded}
            isTodayExpanded={isTodayExpanded}
            setIsTodayExpanded={setIsTodayExpanded}
            isRecentExpanded={isRecentExpanded}
            setIsRecentExpanded={setIsRecentExpanded}
            isArchiveExpanded={isArchiveExpanded}
            setIsArchiveExpanded={setIsArchiveExpanded}
            onCreate={handleCreateSession}
            onClearFilter={() => setSessionQuery("")}
            renderSessionRow={renderSessionRow}
          />
        </div>
      </section>

      <Dialog
        open={pendingRenameSessionId !== null}
        onOpenChange={(open) => {
          if (!open) {
            closeRenameDialog();
          }
        }}
        title="Rename session"
        description={
          pendingRenameSession?.title
            ? `Update the name for "${pendingRenameSession.title}".`
            : "Update the session name."
        }
        className="rounded-2xl bg-surface-1/95 border-border/30"
      >
        <div className="space-y-3">
          <label className="text-sm font-medium text-foreground" htmlFor="session-rename">
            Session name
          </label>
          <Input
            id="session-rename"
            ref={renameInputRef}
            value={renameValue}
            onChange={(event) => setRenameValue(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void confirmRenameSession();
              }
            }}
            aria-label="Session name"
          />
        </div>

        <DialogFooter className="bg-transparent border-none px-0 -mx-0 mt-6">
          <Button variant="secondary" type="button" onClick={closeRenameDialog}>
            Cancel
          </Button>
          <Button
            type="button"
            onClick={() => void confirmRenameSession()}
            disabled={!renameValue.trim()}
          >
            Rename
          </Button>
        </DialogFooter>
      </Dialog>

      <Dialog
        open={pendingDeleteSessionId !== null}
        onOpenChange={(open) => {
          if (!open) {
            closeDeleteDialog();
          }
        }}
        title="Delete session"
        description="This action cannot be undone."
        className="rounded-2xl bg-surface-1/95 border-border/30"
      >
        <div className="space-y-3 text-sm text-muted-foreground">
          <p>
            Are you sure you want to delete{" "}
            <span className="font-medium text-foreground">
              {pendingDeleteSession?.title ?? "this session"}
            </span>
            ?
          </p>
        </div>

        <DialogFooter className="bg-transparent border-none px-0 -mx-0 mt-6">
          <Button variant="secondary" type="button" onClick={closeDeleteDialog}>
            Cancel
          </Button>
          <Button variant="destructive" type="button" onClick={() => void confirmDeleteSession()}>
            Delete
          </Button>
        </DialogFooter>
      </Dialog>
    </>
  );
}

function useShareFeedback() {
  const [shareFeedback, setShareFeedback] = React.useState<Record<string, string>>({});
  const shareTimeoutsRef = React.useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  React.useEffect(() => {
    return () => {
      for (const timeout of shareTimeoutsRef.current.values()) {
        clearTimeout(timeout);
      }
      shareTimeoutsRef.current.clear();
    };
  }, []);

  const handleShareSession = React.useCallback(async (sessionId: string, title: string) => {
    const outcome = await shareSessionLink(sessionId, title);
    if (outcome === "cancelled") {
      return;
    }
    const label = outcome === "shared" ? "Shared" : "Link copied";
    setShareFeedback((prev) => ({ ...prev, [sessionId]: label }));
    const existing = shareTimeoutsRef.current.get(sessionId);
    if (existing) {
      clearTimeout(existing);
    }
    const timeout = setTimeout(() => {
      setShareFeedback((prev) => {
        const next = { ...prev };
        delete next[sessionId];
        return next;
      });
    }, 2000);
    shareTimeoutsRef.current.set(sessionId, timeout);
  }, []);

  return { shareFeedback, handleShareSession };
}

type TasksHeaderProps = {
  taskFilter: TaskFilter;
  favoritesCount: number;
  totalCount: number;
  isExpanded: boolean;
  onToggleExpanded: () => void;
  onSelectFilter: (next: TaskFilter) => void;
};

function TasksHeader({
  taskFilter,
  favoritesCount,
  totalCount,
  isExpanded,
  onToggleExpanded,
  onSelectFilter,
}: TasksHeaderProps) {
  return (
    <div className="flex items-center justify-between rounded-md px-3 py-1.5 group hover:bg-surface-hover transition-colors duration-fast">
      <button
        type="button"
        className="flex flex-1 items-center gap-2 text-left text-fine font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors duration-fast cursor-pointer"
        aria-label="Sessions section"
        aria-expanded={isExpanded}
        onClick={onToggleExpanded}
      >
        <span>{taskFilter === "favorites" ? "Pinned" : "Sessions"}</span>
        <span className="text-[10px] font-semibold text-muted-foreground/70">
          {taskFilter === "favorites" ? favoritesCount : totalCount}
        </span>
        <ChevronDown
          className={cn(
            "h-3 w-3 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-all duration-fast",
            !isExpanded && "-rotate-90"
          )}
        />
      </button>

      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 rounded-md text-muted-foreground hover:text-foreground hover:bg-surface-hover data-[state=open]:bg-foreground/[0.08] data-[state=open]:text-foreground"
            aria-label="Session filters"
          >
            <ListFilter className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-44 rounded-lg p-1">
          <DropdownMenuItem
            onSelect={() => onSelectFilter("all")}
            className={cn(
              "gap-2.5 rounded-md px-2 py-1.5 text-[13px] focus:bg-surface-hover focus:text-foreground cursor-pointer outline-none",
              taskFilter === "all"
                ? "bg-foreground/[0.08] text-foreground font-medium"
                : "text-muted-foreground"
            )}
          >
            <ListTodo className="h-4 w-4" />
            Sessions
            {taskFilter === "all" ? <Check className="ml-auto h-3 w-3" /> : null}
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => onSelectFilter("favorites")}
            className={cn(
              "gap-2.5 rounded-md px-2 py-1.5 text-[13px] focus:bg-surface-hover focus:text-foreground cursor-pointer outline-none",
              taskFilter === "favorites"
                ? "bg-foreground/[0.08] text-foreground font-medium"
                : "text-muted-foreground"
            )}
          >
            <Star className="h-4 w-4" />
            Pinned
            {taskFilter === "favorites" ? <Check className="ml-auto h-3 w-3" /> : null}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

type TasksEmptyStateProps = {
  sessionQuery: string;
  activeProjectId: string | null;
  onCreate: () => void;
  onClearFilter: () => void;
};

type FilterPillProps = {
  icon: React.ReactNode;
  label: string;
  ariaLabel: string;
  onClear: () => void;
};

function FilterPill({ icon, label, ariaLabel, onClear }: FilterPillProps) {
  return (
    <div className="flex items-center justify-between rounded-md border border-border/30 bg-surface-2/40 px-2 py-1.5 text-xs text-muted-foreground">
      <div className="flex items-center gap-2 min-w-0">
        {icon}
        <span className="truncate">{label}</span>
      </div>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-6 w-6 rounded-md text-muted-foreground hover:text-foreground hover:bg-surface-hover"
        aria-label={ariaLabel}
        onClick={onClear}
      >
        <X className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}

type SessionGroupsListProps = {
  searchedSessions: Session[];
  sessionQuery: string;
  activeProjectId: string | null;
  taskFilter: TaskFilter;
  favoriteSessions: Session[];
  todaySessions: Session[];
  recentSessions: Session[];
  archivedSessions: Session[];
  isFavoritesExpanded: boolean;
  setIsFavoritesExpanded: React.Dispatch<React.SetStateAction<boolean>>;
  isTodayExpanded: boolean;
  setIsTodayExpanded: React.Dispatch<React.SetStateAction<boolean>>;
  isRecentExpanded: boolean;
  setIsRecentExpanded: React.Dispatch<React.SetStateAction<boolean>>;
  isArchiveExpanded: boolean;
  setIsArchiveExpanded: React.Dispatch<React.SetStateAction<boolean>>;
  onCreate: () => void;
  onClearFilter: () => void;
  renderSessionRow: (session: Session) => React.ReactNode;
};

function SessionGroupsList({
  searchedSessions,
  sessionQuery,
  activeProjectId,
  taskFilter,
  favoriteSessions,
  todaySessions,
  recentSessions,
  archivedSessions,
  isFavoritesExpanded,
  setIsFavoritesExpanded,
  isTodayExpanded,
  setIsTodayExpanded,
  isRecentExpanded,
  setIsRecentExpanded,
  isArchiveExpanded,
  setIsArchiveExpanded,
  onCreate,
  onClearFilter,
  renderSessionRow,
}: SessionGroupsListProps) {
  if (searchedSessions.length === 0) {
    return (
      <TasksEmptyState
        sessionQuery={sessionQuery}
        activeProjectId={activeProjectId}
        onCreate={onCreate}
        onClearFilter={onClearFilter}
      />
    );
  }

  const groups = [
    {
      key: "pinned",
      label: "Pinned",
      items: favoriteSessions,
      isExpanded: isFavoritesExpanded,
      setExpanded: setIsFavoritesExpanded,
      visible: favoriteSessions.length > 0,
    },
    {
      key: "today",
      label: "Today",
      items: todaySessions,
      isExpanded: isTodayExpanded,
      setExpanded: setIsTodayExpanded,
      visible: taskFilter !== "favorites" && todaySessions.length > 0,
    },
    {
      key: "recent",
      label: "Recent",
      items: recentSessions,
      isExpanded: isRecentExpanded,
      setExpanded: setIsRecentExpanded,
      visible: taskFilter !== "favorites" && recentSessions.length > 0,
    },
    {
      key: "archive",
      label: "Archive",
      items: archivedSessions,
      isExpanded: isArchiveExpanded,
      setExpanded: setIsArchiveExpanded,
      visible: taskFilter !== "favorites" && archivedSessions.length > 0,
    },
  ];

  return (
    <div className="space-y-3">
      {groups.map((group) =>
        group.visible ? (
          <SessionGroup
            key={group.key}
            label={group.label}
            count={group.items.length}
            isExpanded={group.isExpanded}
            onToggle={() => group.setExpanded((prev) => !prev)}
          >
            {group.items.map(renderSessionRow)}
          </SessionGroup>
        ) : null
      )}
      {taskFilter === "favorites" && favoriteSessions.length === 0 ? (
        <div className="px-3 text-xs text-muted-foreground">
          No pinned sessions yet. Star a session to pin it here.
        </div>
      ) : null}
    </div>
  );
}

function TasksEmptyState({
  sessionQuery,
  activeProjectId,
  onCreate,
  onClearFilter,
}: TasksEmptyStateProps) {
  return (
    <div className="space-y-2 px-3">
      <div className="rounded-md border border-border/20 bg-surface-2/40 px-3 py-2 text-xs text-muted-foreground">
        {sessionQuery
          ? "No sessions match this filter."
          : "No sessions yet. Start a new session to begin."}
      </div>
      <button
        type="button"
        className="flex items-center gap-2.5 w-full rounded-md px-3 py-1.5 text-[13px] text-muted-foreground hover:text-foreground hover:bg-surface-hover transition-colors duration-fast cursor-pointer group"
        onClick={onCreate}
      >
        <Sparkles
          className="h-4 w-4 text-muted-foreground opacity-70 group-hover:opacity-100 group-hover:text-foreground transition-all duration-fast"
          aria-hidden="true"
        />
        <span>{activeProjectId ? "New session in project" : "New session"}</span>
      </button>
      {sessionQuery ? (
        <Button
          type="button"
          variant="ghost"
          className="h-7 justify-start px-2 text-xs text-muted-foreground"
          onClick={onClearFilter}
        >
          Clear filter
        </Button>
      ) : null}
    </div>
  );
}

function SessionGroup({
  label,
  count,
  isExpanded,
  onToggle,
  children,
}: {
  label: string;
  count: number;
  isExpanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <button
        type="button"
        className="flex w-full items-center gap-2 rounded-md px-3 py-1 text-left text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground hover:text-foreground hover:bg-surface-hover transition-colors duration-fast"
        aria-expanded={isExpanded}
        onClick={onToggle}
      >
        <span>{label}</span>
        <span className="text-[10px] font-semibold text-muted-foreground/70">{count}</span>
        <ChevronDown
          className={cn(
            "ml-auto h-3 w-3 transition-transform duration-fast",
            !isExpanded && "-rotate-90"
          )}
        />
      </button>
      <div
        className={cn(
          "space-y-1 overflow-hidden transition-all duration-200 ease-out",
          isExpanded
            ? "max-h-[1000px] opacity-100 translate-y-0"
            : "max-h-0 opacity-0 -translate-y-1 pointer-events-none"
        )}
        aria-hidden={!isExpanded}
      >
        {children}
      </div>
    </div>
  );
}

function SidebarSessionRow({
  session,
  isActive,
  isFavorite,
  favoriteLabel,
  shareLabel,
  projects,
  linkComponent: LinkComponent,
  onShare,
  onRename,
  onToggleFavorite,
  onOpenInNewTab,
  onMoveToProject,
  onDelete,
}: {
  session: Session;
  isActive: boolean;
  isFavorite: boolean;
  favoriteLabel: string;
  shareLabel?: string;
  projects: Project[];
  linkComponent: React.ComponentType<{
    href: string;
    className?: string;
    title?: string;
    children: React.ReactNode;
  }>;
  onShare: () => void;
  onRename: () => void;
  onToggleFavorite: () => void;
  onOpenInNewTab: () => void;
  onMoveToProject: (projectId: string | null) => void;
  onDelete: () => void;
}) {
  return (
    <div
      className={cn(
        "relative flex items-center rounded-md px-3 py-1.5 transition-colors duration-fast group",
        isActive
          ? "bg-foreground/[0.08] text-foreground font-medium"
          : "text-muted-foreground hover:bg-surface-hover hover:text-foreground"
      )}
    >
      <LinkComponent
        href={`/sessions/${session.id}`}
        className="flex items-center gap-2.5 flex-1 min-w-0 pr-2 text-[13px] cursor-pointer"
        title={session.title}
      >
        <Brain
          className="h-4 w-4 shrink-0 opacity-70 group-hover:opacity-100 group-hover:text-foreground transition-all duration-fast"
          aria-hidden="true"
        />
        <span className="overflow-hidden whitespace-nowrap block">{session.title}</span>
      </LinkComponent>
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className={cn(
              "absolute right-2 top-1/2 h-6 w-6 -translate-y-1/2 rounded-md",
              "text-muted-foreground hover:text-foreground",
              "bg-surface-2 shadow-sm border border-border/20",
              "transition-opacity opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto",
              "focus-visible:opacity-100 focus-visible:pointer-events-auto",
              "data-[state=open]:opacity-100 data-[state=open]:pointer-events-auto data-[state=open]:bg-surface-3"
            )}
            aria-label="More options"
          >
            <MoreHorizontal className="h-3.5 w-3.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="start"
          side="right"
          sideOffset={6}
          className="w-56 rounded-lg p-1"
        >
          <DropdownMenuItem
            onSelect={onShare}
            className={cn(
              "gap-2.5 rounded-md px-3 py-1.5 text-[13px] focus:bg-surface-hover focus:text-foreground cursor-pointer outline-none",
              shareLabel ? "text-success" : ""
            )}
          >
            <Share2 className="h-4 w-4" aria-hidden="true" />
            <span>{shareLabel ?? "Share"}</span>
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={onRename}
            className="gap-2.5 rounded-md px-3 py-1.5 text-[13px] focus:bg-surface-hover focus:text-foreground cursor-pointer outline-none"
          >
            <PencilLine className="h-4 w-4" aria-hidden="true" />
            <span>Rename</span>
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={onToggleFavorite}
            className="gap-2.5 rounded-md px-3 py-1.5 text-[13px] focus:bg-surface-hover focus:text-foreground cursor-pointer outline-none"
          >
            <Star
              className={cn("h-4 w-4", isFavorite ? "fill-current" : undefined)}
              aria-hidden="true"
            />
            <span>{favoriteLabel}</span>
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={onOpenInNewTab}
            className="gap-2.5 rounded-md px-3 py-1.5 text-[13px] focus:bg-surface-hover focus:text-foreground cursor-pointer outline-none"
          >
            <ExternalLink className="h-4 w-4" aria-hidden="true" />
            <span>Open in new tab</span>
          </DropdownMenuItem>

          <DropdownMenuSub>
            <DropdownMenuSubTrigger className="gap-2.5 rounded-md px-3 py-1.5 text-[13px] focus:bg-surface-hover focus:text-foreground cursor-pointer outline-none data-[state=open]:bg-foreground/5 data-[state=open]:text-foreground">
              <Folder className="h-4 w-4" />
              <span>Move to project</span>
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="w-56 rounded-lg p-1">
              {projects.length === 0 ? (
                <DropdownMenuItem disabled>
                  <span className="text-muted-foreground">No projects for this workspace</span>
                </DropdownMenuItem>
              ) : (
                projects.map((project) => (
                  <DropdownMenuItem
                    key={project.id}
                    onSelect={() => onMoveToProject(project.id)}
                    className="gap-2.5 rounded-md px-3 py-1.5 text-[13px] focus:bg-surface-hover focus:text-foreground cursor-pointer outline-none"
                  >
                    <span>{project.name}</span>
                    {session.projectId === project.id && <Check className="ml-auto h-4 w-4" />}
                  </DropdownMenuItem>
                ))
              )}
              {session.projectId && (
                <>
                  {projects.length > 0 ? <DropdownMenuSeparator /> : null}
                  <DropdownMenuItem
                    onSelect={() => onMoveToProject(null)}
                    className="gap-2.5 rounded-md px-3 py-1.5 text-[13px] focus:bg-surface-hover focus:text-foreground cursor-pointer outline-none"
                  >
                    <span>Remove from project</span>
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuSubContent>
          </DropdownMenuSub>

          <DropdownMenuSeparator className="mx-2" />
          <DropdownMenuItem
            onSelect={onDelete}
            className="gap-2.5 rounded-md px-3 py-1.5 text-[13px] text-destructive focus:text-destructive focus:bg-surface-hover cursor-pointer outline-none"
          >
            <Trash2 className="h-4 w-4" aria-hidden="true" />
            <span>Delete</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
