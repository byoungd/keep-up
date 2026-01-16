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
  DropdownMenuTrigger,
  Input,
  Tooltip,
  useReaderShell,
} from "@ku0/shell";
import {
  Brain,
  Check,
  ChevronDown,
  ChevronRight,
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

type ProjectItem = {
  id: string;
  name: string;
  instructions?: string;
  createdAt: number;
};

const PROJECTS_STORAGE_KEY = "cowork-projects-v1";
const ACTIVE_PROJECT_KEY = "cowork-active-project-v1";
const FAVORITES_STORAGE_KEY = "cowork-task-favorites-v1";

function readProjects(): ProjectItem[] {
  if (typeof window === "undefined") {
    return [];
  }
  try {
    const stored = window.localStorage.getItem(PROJECTS_STORAGE_KEY);
    if (!stored) {
      return [];
    }
    const parsed = JSON.parse(stored) as ProjectItem[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeProjects(projects: ProjectItem[]): void {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(PROJECTS_STORAGE_KEY, JSON.stringify(projects));
}

function readActiveProject(): string | null {
  if (typeof window === "undefined") {
    return null;
  }
  return window.localStorage.getItem(ACTIVE_PROJECT_KEY);
}

function writeActiveProject(projectId: string | null): void {
  if (typeof window === "undefined") {
    return;
  }
  if (projectId) {
    window.localStorage.setItem(ACTIVE_PROJECT_KEY, projectId);
  } else {
    window.localStorage.removeItem(ACTIVE_PROJECT_KEY);
  }
}

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
  const { sessions } = useWorkspace();
  const { Link } = components;

  const [projects, setProjects] = React.useState<ProjectItem[]>([]);
  const [activeProjectId, setActiveProjectId] = React.useState<string | null>(null);
  const [isDialogOpen, setIsDialogOpen] = React.useState(false);
  const [projectName, setProjectName] = React.useState("");
  const [projectInstructions, setProjectInstructions] = React.useState("");
  const [isProjectsExpanded, setIsProjectsExpanded] = React.useState(true);
  const [isTasksExpanded, setIsTasksExpanded] = React.useState(true);
  const [taskFilter, setTaskFilter] = React.useState<TaskFilter>("all");
  const [favoriteIds, setFavoriteIds] = React.useState<Set<string>>(new Set());

  React.useEffect(() => {
    setProjects(readProjects());
    setActiveProjectId(readActiveProject());
    setFavoriteIds(new Set(readFavorites()));
  }, []);

  const sortedProjects = React.useMemo(
    () => [...projects].sort((a, b) => b.createdAt - a.createdAt),
    [projects]
  );

  const sortedSessions = React.useMemo(
    () => [...sessions].sort((a, b) => b.createdAt - a.createdAt),
    [sessions]
  );

  const filteredSessions = React.useMemo(() => {
    if (taskFilter === "favorites") {
      return sortedSessions.filter((session) => favoriteIds.has(session.id));
    }
    if (taskFilter === "scheduled") {
      return [];
    }
    return sortedSessions;
  }, [favoriteIds, sortedSessions, taskFilter]);

  const handleCreateProject = React.useCallback(() => {
    const trimmedName = projectName.trim();
    if (!trimmedName) {
      return;
    }
    const newProject: ProjectItem = {
      id: crypto.randomUUID(),
      name: trimmedName,
      instructions: projectInstructions.trim() || undefined,
      createdAt: Date.now(),
    };
    const next = [newProject, ...projects];
    setProjects(next);
    writeProjects(next);
    setActiveProjectId(newProject.id);
    writeActiveProject(newProject.id);
    setProjectName("");
    setProjectInstructions("");
    setIsDialogOpen(false);
  }, [projectInstructions, projectName, projects]);

  const handleSelectProject = React.useCallback((projectId: string) => {
    setActiveProjectId(projectId);
    writeActiveProject(projectId);
  }, []);

  const toggleFavorite = React.useCallback(
    (sessionId: string) => {
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
    },
    [setFavoriteIds]
  );

  const handleOpenInNewTab = React.useCallback((sessionId: string) => {
    if (typeof window === "undefined") {
      return;
    }
    window.open(`/sessions/${sessionId}`, "_blank", "noopener,noreferrer");
  }, []);

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
            <div className="px-3 py-2 text-[11px] text-muted-foreground/70">No tasks.</div>
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
                          "bg-surface-2 shadow-sm border border-border/20", // Added solid background and subtle border
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
                        onSelect={handlePlaceholderAction}
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
                      <DropdownMenuItem
                        onSelect={handlePlaceholderAction}
                        className="gap-3 rounded-lg px-3 py-2 text-sm"
                      >
                        <Folder className="h-4 w-4" aria-hidden="true" />
                        <span>Move to project</span>
                        <ChevronRight className="ml-auto h-3 w-3 text-muted-foreground" />
                      </DropdownMenuItem>
                      <DropdownMenuSeparator className="mx-2" />
                      <DropdownMenuItem
                        onSelect={handlePlaceholderAction}
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
