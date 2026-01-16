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
  Check,
  ChevronDown,
  ExternalLink,
  Folder,
  FolderPlus,
  ListFilter,
  MoreHorizontal,
  PencilLine,
  Plus,
  Share2,
  Star,
  Trash2,
} from "lucide-react";
import * as React from "react";
import { useWorkspace } from "../../app/providers/WorkspaceProvider";

type TaskFilter = "all" | "favorites" | "scheduled";

const FAVORITES_STORAGE_KEY = "cowork-task-favorites-v1";

function readFavorites(): string[] {
  if (typeof window === "undefined") {
    return [];
  }
  try {
    const stored = window.localStorage.getItem(FAVORITES_STORAGE_KEY);
    const parsed = stored ? (JSON.parse(stored) as string[]) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeFavorites(favorites: Set<string>): void {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(Array.from(favorites)));
}

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
  } = useWorkspace();
  const { Link } = components;

  const [isDialogOpen, setIsDialogOpen] = React.useState(false);
  const [projectName, setProjectName] = React.useState("");
  const [projectInstructions, setProjectInstructions] = React.useState("");
  const [isProjectsExpanded, setIsProjectsExpanded] = React.useState(true);
  const [isTasksExpanded, setIsTasksExpanded] = React.useState(true);
  const [taskFilter, setTaskFilter] = React.useState<TaskFilter>("all");
  const [favoriteIds, setFavoriteIds] = React.useState<Set<string>>(new Set());

  React.useEffect(() => {
    setFavoriteIds(new Set(readFavorites()));
  }, []);

  const sortedProjects = React.useMemo(
    () => [...projects].sort((a, b) => b.createdAt - a.createdAt),
    [projects]
  );

  const activeProject = React.useMemo(() => {
    return projects.find((p) => p.id === activeProjectId) ?? null;
  }, [projects, activeProjectId]);

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
    } catch (err) {
      console.error("Failed to create project", err);
    }
  }, [projectInstructions, projectName, createProject]);

  const handleSelectProject = React.useCallback(
    (projectId: string) => {
      // Toggle if clicking same project? Or just select?
      if (activeProjectId === projectId) {
        setActiveProject(null); // Deselect
      } else {
        setActiveProject(projectId);
      }
    },
    [activeProjectId, setActiveProject]
  );

  const toggleFavorite = React.useCallback((sessionId: string) => {
    setFavoriteIds((prev) => {
      const next = new Set(prev);
      if (next.has(sessionId)) {
        next.delete(sessionId);
      } else {
        next.add(sessionId);
      }
      writeFavorites(next);
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
      } catch (err) {
        console.error("Failed to move session", err);
      }
    },
    [moveSessionToProject]
  );

  const handleDeleteSession = React.useCallback(
    async (sessionId: string) => {
      if (window.confirm("Are you sure you want to delete this session?")) {
        try {
          await deleteSession(sessionId);
        } catch (e) {
          console.error("Failed to delete", e);
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
        <div className="flex items-center justify-between rounded-lg px-3 py-2 group hover:bg-surface-2/85 transition-colors">
          <button
            type="button"
            className="flex flex-1 items-center gap-2 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
            aria-label="Projects section"
            aria-expanded={isProjectsExpanded}
            onClick={() => setIsProjectsExpanded((prev) => !prev)}
          >
            <span>Projects</span>
            <ChevronDown
              className={cn(
                "h-3 w-3 opacity-0 group-hover:opacity-100 transition-all",
                !isProjectsExpanded && "-rotate-90"
              )}
            />
          </button>
          <Tooltip content="Create project" side="top">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 rounded-md text-muted-foreground hover:text-foreground hover:bg-surface-1/80 hover:ring-1 hover:ring-border/50"
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
          <button
            type="button"
            className="flex items-center gap-3 w-full rounded-lg px-3 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-surface-2/90 transition-colors cursor-pointer"
            onClick={() => setIsDialogOpen(true)}
          >
            <FolderPlus className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            <span>New project</span>
          </button>

          {sortedProjects.map((project) => (
            <button
              key={project.id}
              type="button"
              onClick={() => handleSelectProject(project.id)}
              className={cn(
                "flex items-center gap-3 w-full rounded-lg px-3 py-2 text-sm transition-colors cursor-pointer",
                activeProjectId === project.id
                  ? "bg-surface-2 text-foreground font-medium"
                  : "text-muted-foreground hover:bg-surface-2/90 hover:text-foreground"
              )}
            >
              <Folder className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              <span className="truncate">{project.name}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="space-y-1">
        <div className="flex items-center justify-between rounded-lg px-3 py-2 group hover:bg-surface-2/85 transition-colors">
          <button
            type="button"
            className="flex flex-1 items-center gap-2 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
            aria-label="All tasks section"
            aria-expanded={isTasksExpanded}
            onClick={() => setIsTasksExpanded((prev) => !prev)}
          >
            <span>
              {activeProjectId ? (
                <span className="flex items-center gap-1">
                  {activeProject?.name ?? "Project"}
                  <span className="text-muted-foreground/50 mx-1">/</span>
                </span>
              ) : null}
              {taskFilter === "favorites"
                ? "Favorites"
                : taskFilter === "scheduled"
                  ? "Scheduled"
                  : "Tasks"}
            </span>
            <ChevronDown
              className={cn(
                "h-3 w-3 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-all",
                !isTasksExpanded && "-rotate-90"
              )}
            />
          </button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 rounded-md text-muted-foreground hover:text-foreground hover:bg-surface-1/80 hover:ring-1 hover:ring-border/50 data-[state=open]:bg-surface-1/90 data-[state=open]:text-foreground data-[state=open]:ring-1 data-[state=open]:ring-border/60"
                aria-label="Task filters"
              >
                <ListFilter className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-44 rounded-xl p-2">
              <DropdownMenuItem
                onSelect={() => setTaskFilter("all")}
                className="gap-3 rounded-lg px-3 py-2 text-sm"
              >
                Tasks
                {taskFilter === "all" ? <Check className="ml-auto h-3 w-3" /> : null}
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() => setTaskFilter("favorites")}
                className="gap-3 rounded-lg px-3 py-2 text-sm"
              >
                Favorites
                {taskFilter === "favorites" ? <Check className="ml-auto h-3 w-3" /> : null}
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() => setTaskFilter("scheduled")}
                className="gap-3 rounded-lg px-3 py-2 text-sm"
              >
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
            <div className="px-3 py-2 text-[11px] text-muted-foreground/70">
              {activeProjectId ? "No tasks in this project." : "No tasks."}
            </div>
          ) : (
            filteredSessions.map((session) => {
              const isActive = activeSessionId === session.id;
              const isFavorite = favoriteIds.has(session.id);
              const favoriteLabel = isFavorite ? "Remove from favorites" : "Add to favorites";
              return (
                <div
                  key={session.id}
                  className={cn(
                    "relative flex items-center rounded-lg px-3 py-1.5 transition-colors group",
                    isActive
                      ? "bg-surface-2 text-foreground font-medium"
                      : "text-muted-foreground hover:bg-surface-2/90 hover:text-foreground"
                  )}
                >
                  <Link
                    href={`/sessions/${session.id}`}
                    className="flex items-center gap-2 flex-1 min-w-0 pr-2 text-sm cursor-pointer"
                    title={session.title}
                  >
                    <Brain className="h-4 w-4 shrink-0" aria-hidden="true" />
                    <span className="overflow-hidden whitespace-nowrap block">{session.title}</span>
                  </Link>
                  <DropdownMenu>
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
                      className="w-56 rounded-xl p-2"
                    >
                      <DropdownMenuItem
                        onSelect={handlePlaceholderAction}
                        className="gap-3 rounded-lg px-3 py-2 text-sm"
                      >
                        <Share2 className="h-4 w-4" aria-hidden="true" />
                        <span>Share</span>
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onSelect={() => handleRenamePrompt(session.id)}
                        className="gap-3 rounded-lg px-3 py-2 text-sm"
                      >
                        <PencilLine className="h-4 w-4" aria-hidden="true" />
                        <span>Rename</span>
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onSelect={() => toggleFavorite(session.id)}
                        className="gap-3 rounded-lg px-3 py-2 text-sm"
                      >
                        <Star
                          className={cn("h-4 w-4", isFavorite ? "fill-current" : undefined)}
                          aria-hidden="true"
                        />
                        <span>{favoriteLabel}</span>
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onSelect={() => handleOpenInNewTab(session.id)}
                        className="gap-3 rounded-lg px-3 py-2 text-sm"
                      >
                        <ExternalLink className="h-4 w-4" aria-hidden="true" />
                        <span>Open in new tab</span>
                      </DropdownMenuItem>

                      <DropdownMenuSub>
                        <DropdownMenuSubTrigger className="gap-3 rounded-lg px-3 py-2 text-sm">
                          <Folder className="h-4 w-4" />
                          <span>Move to project</span>
                        </DropdownMenuSubTrigger>
                        <DropdownMenuSubContent className="w-56 rounded-xl p-2">
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
                                  className="gap-3 rounded-lg px-3 py-2 text-sm"
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
                                    className="gap-3 rounded-lg px-3 py-2 text-sm"
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
                        className="gap-3 rounded-lg px-3 py-2 text-sm text-destructive focus:text-destructive"
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
