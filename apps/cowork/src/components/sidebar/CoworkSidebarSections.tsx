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
  Tooltip,
  useReaderShell,
} from "@ku0/shell";
import {
  Brain,
  CalendarClock,
  Check,
  ChevronDown,
  ExternalLink,
  Folder,
  FolderPlus,
  ListFilter,
  ListTodo,
  Loader2,
  MoreHorizontal,
  PencilLine,
  Pin,
  PinOff,
  Plus,
  Share2,
  Sparkles,
  Star,
  Trash2,
} from "lucide-react";
import * as React from "react";
import { useWorkspace } from "../../app/providers/WorkspaceProvider";

type TaskFilter = "all" | "favorites" | "scheduled";

const FAVORITES_STORAGE_KEY = "cowork-task-favorites-v1";
const PINNED_PROJECTS_STORAGE_KEY = "cowork-pinned-projects-v1";

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

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Refactoring out of scope for current task
export function CoworkSidebarSections() {
  const { router, components } = useReaderShell();
  const {
    sessions,
    projects,
    activeProjectId,
    setActiveProject,
    createProject,
    moveSessionToProject,
    renameSession,
    deleteSession,
    getSessionsForProject,
  } = useWorkspace();
  const { Link } = components;

  const [isDialogOpen, setIsDialogOpen] = React.useState(false);
  const [projectName, setProjectName] = React.useState("");
  const [projectInstructions, setProjectInstructions] = React.useState("");
  const [isProjectsExpanded, setIsProjectsExpanded] = React.useState(true);
  const [isTasksExpanded, setIsTasksExpanded] = React.useState(true);
  const [taskFilter, setTaskFilter] = React.useState<TaskFilter>("all");
  const [favoriteIds, setFavoriteIds] = React.useState<Set<string>>(new Set());
  const [pinnedProjectIds, setPinnedProjectIds] = React.useState<Set<string>>(new Set());
  const [expandedProjectIds, setExpandedProjectIds] = React.useState<Set<string>>(new Set());

  React.useEffect(() => {
    setFavoriteIds(readStorageSet(FAVORITES_STORAGE_KEY));
    setPinnedProjectIds(readStorageSet(PINNED_PROJECTS_STORAGE_KEY));
  }, []);

  const sortedProjects = React.useMemo(() => {
    return [...projects].sort((a, b) => {
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
  }, [projects, pinnedProjectIds]);

  /* activeProject unused after header cleanup */
  /* const activeProject = React.useMemo(() => {
    return projects.find((p) => p.id === activeProjectId) ?? null;
  }, [projects, activeProjectId]); */

  const sortedSessions = React.useMemo(
    () => [...sessions].sort((a, b) => b.createdAt - a.createdAt),
    [sessions]
  );

  const filteredSessions = React.useMemo(() => {
    let filtered = sortedSessions;

    // Filter by project if active
    if (activeProjectId) {
      filtered = filtered.filter((s) => s.projectId === activeProjectId);
    } else {
      // If no project selected, maybe show unassigned or all?
      // Usually "Tasks" section shows everything unless filtered.
      // Or if a project IS selected, we ONLY show project tasks?
      // Let's assume selecting a project filters the main list.
      // But if user wants to see "All Tasks", they deselect project?
      // The previous UI had separate sections.
      // If activeProjectId is set, we probably want to show tasks for that project only.
      // But we need a way to deselect project.
    }

    if (taskFilter === "favorites") {
      filtered = filtered.filter((session) => favoriteIds.has(session.id));
    }
    if (taskFilter === "scheduled") {
      // Not implemented
      return [];
    }

    return filtered;
  }, [favoriteIds, sortedSessions, taskFilter, activeProjectId]);

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
    if (!trimmedName) {
      return;
    }

    try {
      await createProject(trimmedName, projectInstructions.trim() || undefined);
      setProjectName("");
      setProjectInstructions("");
      setIsDialogOpen(false);
    } catch (_err) {
      void _err;
    }
  }, [projectInstructions, projectName, createProject]);

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

  const toggleExpandProject = React.useCallback((projectId: string) => {
    setExpandedProjectIds((prev) => {
      const next = new Set(prev);
      if (next.has(projectId)) {
        next.delete(projectId);
      } else {
        next.add(projectId);
      }
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

  const handleDeleteSession = React.useCallback(
    async (sessionId: string) => {
      if (window.confirm("Are you sure you want to delete this session?")) {
        try {
          await deleteSession(sessionId);
        } catch (_e) {
          void _e;
        }
      }
    },
    [deleteSession]
  );

  const handleRenamePrompt = React.useCallback(
    (sessionId: string) => {
      const s = sessions.find((x) => x.id === sessionId);
      const newName = window.prompt("Enter new session name", s?.title);
      if (newName) {
        renameSession(sessionId, newName);
      }
    },
    [sessions, renameSession]
  );

  const handlePlaceholderAction = React.useCallback(() => {
    /* TODO */
  }, []);

  const activeSessionId = React.useMemo(() => {
    const match = router.pathname.match(/^\/sessions\/([^/]+)/);
    return match?.[1] ?? null;
  }, [router.pathname]);

  return (
    <div className="space-y-2">
      <section className="space-y-1">
        <div className="flex items-center justify-between rounded-md px-3 py-1.5 group hover:bg-surface-2 transition-colors duration-fast">
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
              className="h-6 w-6 rounded-md text-muted-foreground hover:text-foreground hover:bg-surface-2"
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
          {projects.length === 0 && (
            <button
              type="button"
              className="flex items-center gap-2.5 w-full rounded-md px-3 py-1.5 text-[13px] text-muted-foreground hover:text-foreground hover:bg-surface-2 transition-colors duration-fast cursor-pointer group"
              onClick={() => setIsDialogOpen(true)}
            >
              <FolderPlus
                className="h-4 w-4 text-muted-foreground opacity-70 group-hover:opacity-100 group-hover:text-foreground transition-all duration-fast"
                aria-hidden="true"
              />
              <span>New project</span>
            </button>
          )}

          {sortedProjects.map((project) => {
            const isExpanded = expandedProjectIds.has(project.id);
            const isPinned = pinnedProjectIds.has(project.id);
            const projectTasks = getSessionsForProject(project.id);
            const hasTasks = projectTasks.length > 0;

            return (
              <div key={project.id} className="space-y-0.5">
                <div
                  className={cn(
                    "group relative flex items-center rounded-md px-3 py-1.5 transition-colors duration-fast",
                    activeProjectId === project.id
                      ? "bg-foreground/[0.08] text-foreground font-medium"
                      : "text-muted-foreground hover:bg-surface-2 hover:text-foreground"
                  )}
                >
                  <button
                    type="button"
                    onClick={() => handleSelectProject(project.id)}
                    className="flex flex-1 items-center gap-2.5 min-w-0 text-[13px] text-left cursor-pointer outline-none pl-0.5"
                  >
                    <Folder
                      className={cn(
                        "h-4 w-4 shrink-0 transition-all duration-fast",
                        activeProjectId === project.id
                          ? "text-foreground"
                          : "text-muted-foreground opacity-70 group-hover:opacity-100 group-hover:text-foreground"
                      )}
                      aria-hidden="true"
                    />
                    <span className="truncate flex-1">{project.name}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => toggleExpandProject(project.id)}
                    className={cn(
                      "flex items-center justify-center h-5 w-5 rounded hover:bg-surface-2 transition-colors duration-fast cursor-pointer text-muted-foreground hover:text-foreground mr-7",
                      hasTasks
                        ? "opacity-0 group-hover:opacity-100"
                        : "opacity-0 pointer-events-none"
                    )}
                    aria-label={isExpanded ? "Collapse project" : "Expand project"}
                  >
                    <ChevronDown
                      className={cn("h-3 w-3 transition-transform", !isExpanded && "-rotate-90")}
                    />
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
                        onSelect={() => togglePinProject(project.id)}
                        className="gap-2.5 rounded-md px-3 py-1.5 text-[13px] focus:bg-surface-2 focus:text-foreground cursor-pointer outline-none"
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
                      <DropdownMenuItem className="gap-2.5 rounded-md px-3 py-1.5 text-[13px] focus:bg-surface-2 focus:text-foreground cursor-pointer outline-none">
                        <PencilLine className="h-3.5 w-3.5" />
                        <span>Edit</span>
                      </DropdownMenuItem>
                      <DropdownMenuSeparator className="mx-1" />
                      <DropdownMenuItem className="gap-2.5 rounded-md px-3 py-1.5 text-[13px] text-destructive focus:text-destructive focus:bg-surface-2 cursor-pointer outline-none">
                        <Trash2 className="h-3.5 w-3.5" />
                        <span>Delete</span>
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>

                {/* Nested Project Tasks */}
                {isExpanded && hasTasks && (
                  <div className="ml-2 pl-2 border-l border-border/20 space-y-0.5 mb-1">
                    {projectTasks.map((session) => {
                      const isActive = activeSessionId === session.id;
                      const isRunning = session.status === "running";
                      return (
                        <div
                          key={session.id}
                          className={cn(
                            "relative flex items-center rounded-md px-3 py-1.5 transition-colors duration-fast group",
                            isActive
                              ? "bg-foreground/[0.08] text-foreground font-medium"
                              : "text-muted-foreground hover:bg-surface-2 hover:text-foreground"
                          )}
                        >
                          <Link
                            href={`/sessions/${session.id}`}
                            className="flex items-center gap-2.5 flex-1 min-w-0 text-[13px] cursor-pointer"
                            title={session.title}
                          >
                            {isRunning ? (
                              <Loader2 className="h-4 w-4 shrink-0 text-primary animate-spin" />
                            ) : (
                              <Brain
                                className="h-4 w-4 shrink-0 opacity-70 group-hover:opacity-100 group-hover:text-foreground transition-all duration-fast"
                                aria-hidden="true"
                              />
                            )}
                            <span className="truncate">{session.title}</span>
                          </Link>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      <section className="space-y-1">
        <div className="flex items-center justify-between rounded-md px-3 py-1.5 group hover:bg-surface-2 transition-colors duration-fast">
          <button
            type="button"
            className="flex flex-1 items-center gap-2 text-left text-fine font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors duration-fast cursor-pointer"
            aria-label="All tasks section"
            aria-expanded={isTasksExpanded}
            onClick={() => setIsTasksExpanded((prev) => !prev)}
          >
            <span>
              {taskFilter === "favorites"
                ? "Favorites"
                : taskFilter === "scheduled"
                  ? "Scheduled"
                  : "Tasks"}
            </span>
            <ChevronDown
              className={cn(
                "h-3 w-3 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-all duration-fast",
                !isTasksExpanded && "-rotate-90"
              )}
            />
          </button>

          <DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 rounded-md text-muted-foreground hover:text-foreground hover:bg-surface-2 data-[state=open]:bg-surface-2 data-[state=open]:text-foreground"
                aria-label="Task filters"
              >
                <ListFilter className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-44 rounded-lg p-1">
              <DropdownMenuItem
                onSelect={() => {
                  setTaskFilter("all");
                  setActiveProject(null);
                }}
                className={cn(
                  "gap-2.5 rounded-md px-2 py-1.5 text-[13px] focus:bg-surface-2 focus:text-foreground cursor-pointer outline-none",
                  taskFilter === "all"
                    ? "bg-foreground/[0.08] text-foreground font-medium"
                    : "text-muted-foreground"
                )}
              >
                <ListTodo className="h-4 w-4" />
                Tasks
                {taskFilter === "all" ? <Check className="ml-auto h-3 w-3" /> : null}
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() => setTaskFilter("favorites")}
                className={cn(
                  "gap-2.5 rounded-md px-2 py-1.5 text-[13px] focus:bg-surface-2 focus:text-foreground cursor-pointer outline-none",
                  taskFilter === "favorites"
                    ? "bg-foreground/[0.08] text-foreground font-medium"
                    : "text-muted-foreground"
                )}
              >
                <Star className="h-4 w-4" />
                Favorites
                {taskFilter === "favorites" ? <Check className="ml-auto h-3 w-3" /> : null}
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() => setTaskFilter("scheduled")}
                className={cn(
                  "gap-2.5 rounded-md px-2 py-1.5 text-[13px] focus:bg-surface-2 focus:text-foreground cursor-pointer outline-none",
                  taskFilter === "scheduled"
                    ? "bg-foreground/[0.08] text-foreground font-medium"
                    : "text-muted-foreground"
                )}
              >
                <CalendarClock className="h-4 w-4" />
                Scheduled
                {taskFilter === "scheduled" ? <Check className="ml-auto h-3 w-3" /> : null}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div
          className={cn(
            "space-y-1 overflow-hidden transition-all duration-200 ease-out",
            isTasksExpanded
              ? "max-h-[1000px] opacity-100 translate-y-0"
              : "max-h-0 opacity-0 -translate-y-1 pointer-events-none"
          )}
          aria-hidden={!isTasksExpanded}
        >
          {filteredSessions.length === 0 ? (
            <button
              type="button"
              className="flex items-center gap-2.5 w-full rounded-md px-3 py-1.5 text-[13px] text-muted-foreground hover:text-foreground hover:bg-surface-2 transition-colors duration-fast cursor-pointer group"
              onClick={() => router.push("/new-session")}
            >
              <Sparkles
                className="h-4 w-4 text-muted-foreground opacity-70 group-hover:opacity-100 group-hover:text-foreground transition-all duration-fast"
                aria-hidden="true"
              />
              <span>{activeProjectId ? "New task in project" : "New task"}</span>
            </button>
          ) : (
            filteredSessions.map((session) => {
              const isActive = activeSessionId === session.id;
              const isFavorite = favoriteIds.has(session.id);
              const favoriteLabel = isFavorite ? "Remove from favorites" : "Add to favorites";
              return (
                <div
                  key={session.id}
                  className={cn(
                    "relative flex items-center rounded-md px-3 py-1.5 transition-colors duration-fast group",
                    isActive
                      ? "bg-foreground/[0.08] text-foreground font-medium"
                      : "text-muted-foreground hover:bg-surface-2 hover:text-foreground"
                  )}
                >
                  <Link
                    href={`/sessions/${session.id}`}
                    className="flex items-center gap-2.5 flex-1 min-w-0 pr-2 text-[13px] cursor-pointer"
                    title={session.title}
                  >
                    <Brain
                      className="h-4 w-4 shrink-0 opacity-70 group-hover:opacity-100 group-hover:text-foreground transition-all duration-fast"
                      aria-hidden="true"
                    />
                    <span className="overflow-hidden whitespace-nowrap block">{session.title}</span>
                  </Link>
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
                        onSelect={handlePlaceholderAction}
                        className="gap-2.5 rounded-md px-3 py-1.5 text-[13px] focus:bg-surface-2 focus:text-foreground cursor-pointer outline-none"
                      >
                        <Share2 className="h-4 w-4" aria-hidden="true" />
                        <span>Share</span>
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onSelect={() => handleRenamePrompt(session.id)}
                        className="gap-2.5 rounded-md px-3 py-1.5 text-[13px] focus:bg-surface-2 focus:text-foreground cursor-pointer outline-none"
                      >
                        <PencilLine className="h-4 w-4" aria-hidden="true" />
                        <span>Rename</span>
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onSelect={() => toggleFavorite(session.id)}
                        className="gap-2.5 rounded-md px-3 py-1.5 text-[13px] focus:bg-surface-2 focus:text-foreground cursor-pointer outline-none"
                      >
                        <Star
                          className={cn("h-4 w-4", isFavorite ? "fill-current" : undefined)}
                          aria-hidden="true"
                        />
                        <span>{favoriteLabel}</span>
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onSelect={() => handleOpenInNewTab(session.id)}
                        className="gap-2.5 rounded-md px-3 py-1.5 text-[13px] focus:bg-surface-2 focus:text-foreground cursor-pointer outline-none"
                      >
                        <ExternalLink className="h-4 w-4" aria-hidden="true" />
                        <span>Open in new tab</span>
                      </DropdownMenuItem>

                      <DropdownMenuSub>
                        <DropdownMenuSubTrigger className="gap-2.5 rounded-md px-3 py-1.5 text-[13px] focus:bg-surface-2 focus:text-foreground cursor-pointer outline-none data-[state=open]:bg-surface-2 data-[state=open]:text-foreground">
                          <Folder className="h-4 w-4" />
                          <span>Move to project</span>
                        </DropdownMenuSubTrigger>
                        <DropdownMenuSubContent className="w-56 rounded-lg p-1">
                          {sortedProjects.length === 0 ? (
                            <DropdownMenuItem disabled>
                              <span className="text-muted-foreground">No projects</span>
                            </DropdownMenuItem>
                          ) : (
                            <>
                              {sortedProjects.map((project) => (
                                <DropdownMenuItem
                                  key={project.id}
                                  onSelect={() => handleMoveToProject(session.id, project.id)}
                                  className="gap-2.5 rounded-md px-3 py-1.5 text-[13px] focus:bg-surface-2 focus:text-foreground cursor-pointer outline-none"
                                >
                                  <span>{project.name}</span>
                                  {session.projectId === project.id && (
                                    <Check className="ml-auto h-4 w-4" />
                                  )}
                                </DropdownMenuItem>
                              ))}
                              {session.projectId && (
                                <>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem
                                    onSelect={() => handleMoveToProject(session.id, null)}
                                    className="gap-2.5 rounded-md px-3 py-1.5 text-[13px] focus:bg-surface-2 focus:text-foreground cursor-pointer outline-none"
                                  >
                                    <span>Remove from project</span>
                                  </DropdownMenuItem>
                                </>
                              )}
                            </>
                          )}
                        </DropdownMenuSubContent>
                      </DropdownMenuSub>

                      <DropdownMenuSeparator className="mx-2" />
                      <DropdownMenuItem
                        onSelect={() => handleDeleteSession(session.id)}
                        className="gap-2.5 rounded-md px-3 py-1.5 text-[13px] text-destructive focus:text-destructive focus:bg-surface-2 cursor-pointer outline-none"
                      >
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                        <span>Delete</span>
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              );
            })
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
            <div className="h-12 w-12 rounded-2xl bg-surface-2/70 border border-border/40 flex items-center justify-center text-muted-foreground">
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
            disabled={!projectName.trim()}
            className="min-w-[96px]"
          >
            Create
          </Button>
        </DialogFooter>
      </Dialog>
    </div>
  );
}
