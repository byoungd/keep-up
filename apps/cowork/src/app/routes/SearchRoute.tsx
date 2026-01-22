import type { CoworkTask, CoworkTaskStatus } from "@ku0/agent-runtime";
import { cn } from "@ku0/shared/utils";
import { Input } from "@ku0/shell";
import { useNavigate } from "@tanstack/react-router";
import { Clock, FileText, Folder, Search } from "lucide-react";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import { type CoworkArtifact, listLibraryArtifacts, listTasks } from "../../api/coworkApi";
import { type ArtifactPayload, ArtifactPayloadSchema } from "../../features/tasks/types";
import type { Session } from "../../features/workspace/types";
import { useWorkspace } from "../providers/WorkspaceProvider";

type TaskSearchItem = {
  task: CoworkTask;
  sessionId: string;
  sessionTitle: string;
  projectName?: string;
  workspaceName?: string;
};

type ArtifactSearchItem = {
  record: CoworkArtifact;
  payload: ArtifactPayload | null;
  snippet: string;
  searchText: string;
};

export function SearchRoute() {
  const navigate = useNavigate();
  const { sessions, projects, workspaces } = useWorkspace();
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [taskCache, setTaskCache] = useState<Record<string, CoworkTask[]>>({});
  const [tasksError, setTasksError] = useState<string | null>(null);
  const [isLoadingTasks, setIsLoadingTasks] = useState(false);
  const [artifactRecords, setArtifactRecords] = useState<CoworkArtifact[]>([]);
  const [artifactError, setArtifactError] = useState<string | null>(null);
  const [isLoadingArtifacts, setIsLoadingArtifacts] = useState(false);

  useEffect(() => {
    const handle = setTimeout(() => {
      setDebouncedQuery(query.trim());
    }, 200);
    return () => clearTimeout(handle);
  }, [query]);

  useEffect(() => {
    let isActive = true;
    setIsLoadingArtifacts(true);
    setArtifactError(null);
    listLibraryArtifacts()
      .then((data) => {
        if (isActive) {
          setArtifactRecords(data);
        }
      })
      .catch(() => {
        if (isActive) {
          setArtifactError("Failed to load artifacts.");
        }
      })
      .finally(() => {
        if (isActive) {
          setIsLoadingArtifacts(false);
        }
      });
    return () => {
      isActive = false;
    };
  }, []);

  const normalizedQuery = debouncedQuery.toLowerCase();
  const hasQuery = normalizedQuery.length > 0;
  const handleOpenSession = (sessionId: string) => {
    navigate({
      to: "/sessions/$sessionId",
      params: { sessionId },
    });
  };

  useEffect(() => {
    if (normalizedQuery.length < 2 || sessions.length === 0) {
      setIsLoadingTasks(false);
      setTasksError(null);
      return;
    }

    const missingSessionIds = sessions
      .map((session) => session.id)
      .filter((sessionId) => !taskCache[sessionId]);

    if (missingSessionIds.length === 0) {
      return;
    }

    let isActive = true;
    setIsLoadingTasks(true);
    setTasksError(null);

    Promise.allSettled(
      missingSessionIds.map(async (sessionId) => ({
        sessionId,
        tasks: await listTasks(sessionId),
      }))
    )
      .then((results) => {
        if (!isActive) {
          return;
        }
        let hadError = false;
        const nextEntries: Record<string, CoworkTask[]> = {};
        for (const result of results) {
          if (result.status === "fulfilled") {
            nextEntries[result.value.sessionId] = result.value.tasks;
          } else {
            hadError = true;
          }
        }
        setTaskCache((prev) => ({ ...prev, ...nextEntries }));
        if (hadError) {
          setTasksError("Some tasks could not be loaded.");
        }
      })
      .finally(() => {
        if (isActive) {
          setIsLoadingTasks(false);
        }
      });

    return () => {
      isActive = false;
    };
  }, [normalizedQuery, sessions, taskCache]);

  const projectNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const project of projects) {
      map.set(project.id, project.name);
    }
    return map;
  }, [projects]);

  const workspaceNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const workspace of workspaces) {
      map.set(workspace.id, workspace.name);
    }
    return map;
  }, [workspaces]);

  const sessionResults = useMemo(() => {
    if (!hasQuery) {
      return [];
    }
    return buildSessionResults({
      sessions,
      normalizedQuery,
      projectNameById,
      workspaceNameById,
    });
  }, [hasQuery, sessions, normalizedQuery, projectNameById, workspaceNameById]);

  const taskResults = useMemo<TaskSearchItem[]>(() => {
    if (!hasQuery) {
      return [];
    }
    return buildTaskResults({
      sessions,
      taskCache,
      normalizedQuery,
      projectNameById,
      workspaceNameById,
    });
  }, [hasQuery, normalizedQuery, sessions, taskCache, projectNameById, workspaceNameById]);

  const artifactIndex = useMemo<ArtifactSearchItem[]>(() => {
    return artifactRecords.map((record) => {
      const parsed = ArtifactPayloadSchema.safeParse(record.artifact);
      const payload = parsed.success ? parsed.data : null;
      const snippet = payload ? buildArtifactSnippet(payload) : record.title;
      const searchText = [
        record.title,
        record.type,
        record.taskTitle,
        record.sessionTitle,
        record.sourcePath,
        snippet,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return { record, payload, snippet, searchText };
    });
  }, [artifactRecords]);

  const artifactResults = useMemo(() => {
    if (!hasQuery) {
      return [];
    }
    return artifactIndex.filter((item) => item.searchText.includes(normalizedQuery));
  }, [artifactIndex, hasQuery, normalizedQuery]);

  const totalResults = sessionResults.length + taskResults.length + artifactResults.length;

  return (
    <div className="page-grid">
      <SearchHeader query={query} onChange={setQuery} />

      {hasQuery ? (
        <SearchResultsPanel
          totalResults={totalResults}
          sessionResults={sessionResults}
          taskResults={taskResults}
          artifactResults={artifactResults}
          projectNameById={projectNameById}
          workspaceNameById={workspaceNameById}
          isLoadingTasks={isLoadingTasks}
          tasksError={tasksError}
          isLoadingArtifacts={isLoadingArtifacts}
          artifactError={artifactError}
          onNavigate={handleOpenSession}
        />
      ) : (
        <RecentSessionsPanel
          sessions={sessions}
          workspaceNameById={workspaceNameById}
          onNavigate={handleOpenSession}
        />
      )}
    </div>
  );
}

function SearchHeader({ query, onChange }: { query: string; onChange: (value: string) => void }) {
  return (
    <section className="card-panel space-y-4">
      <div className="space-y-1">
        <p className="text-sm font-semibold text-foreground">Search</p>
        <p className="text-xs text-muted-foreground">
          Search sessions, tasks, and artifacts across your workspace.
        </p>
      </div>
      <Input
        value={query}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Search by title, prompt, or artifact..."
        aria-label="Search sessions, tasks, and artifacts"
        leftIcon={<Search className="h-4 w-4" aria-hidden="true" />}
      />
    </section>
  );
}

function RecentSessionsPanel({
  sessions,
  workspaceNameById,
  onNavigate,
}: {
  sessions: Session[];
  workspaceNameById: Map<string, string>;
  onNavigate: (sessionId: string) => void;
}) {
  return (
    <section className="card-panel space-y-3">
      <p className="text-sm font-semibold text-foreground">Recent sessions</p>
      {sessions.length === 0 ? (
        <p className="text-xs text-muted-foreground">No sessions yet.</p>
      ) : (
        <div className="space-y-2">
          {sessions.slice(0, 6).map((session) => (
            <button
              key={session.id}
              type="button"
              className="w-full text-left rounded-xl border border-border/40 bg-surface-1/60 px-4 py-3 transition hover:bg-surface-2/60"
              onClick={() => onNavigate(session.id)}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-foreground truncate">{session.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {workspaceNameById.get(session.workspaceId) ?? "Workspace"}
                  </p>
                </div>
                <span className="text-micro text-muted-foreground">
                  {new Date(session.createdAt).toLocaleDateString()}
                </span>
              </div>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

function SearchResultsPanel({
  totalResults,
  sessionResults,
  taskResults,
  artifactResults,
  projectNameById,
  workspaceNameById,
  isLoadingTasks,
  tasksError,
  isLoadingArtifacts,
  artifactError,
  onNavigate,
}: {
  totalResults: number;
  sessionResults: Session[];
  taskResults: TaskSearchItem[];
  artifactResults: ArtifactSearchItem[];
  projectNameById: Map<string, string>;
  workspaceNameById: Map<string, string>;
  isLoadingTasks: boolean;
  tasksError: string | null;
  isLoadingArtifacts: boolean;
  artifactError: string | null;
  onNavigate: (sessionId: string) => void;
}) {
  return (
    <section className="card-panel space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-foreground">Results</p>
        <span className="text-xs text-muted-foreground">{totalResults} matches</span>
      </div>

      {totalResults === 0 ? (
        <p className="text-xs text-muted-foreground">No matches found.</p>
      ) : (
        <div className="space-y-6">
          <SessionResultsSection
            sessions={sessionResults}
            projectNameById={projectNameById}
            workspaceNameById={workspaceNameById}
            onNavigate={onNavigate}
          />

          <TaskResultsSection
            taskResults={taskResults}
            isLoading={isLoadingTasks}
            error={tasksError}
            onNavigate={onNavigate}
          />

          <ArtifactResultsSection
            artifactResults={artifactResults}
            isLoading={isLoadingArtifacts}
            error={artifactError}
            onNavigate={onNavigate}
          />
        </div>
      )}
    </section>
  );
}

function SessionResultsSection({
  sessions,
  projectNameById,
  workspaceNameById,
  onNavigate,
}: {
  sessions: Session[];
  projectNameById: Map<string, string>;
  workspaceNameById: Map<string, string>;
  onNavigate: (sessionId: string) => void;
}) {
  return (
    <SearchSection
      title="Sessions"
      icon={<Folder className="h-4 w-4" aria-hidden="true" />}
      isEmpty={sessions.length === 0}
    >
      {sessions.map((session) => (
        <button
          key={session.id}
          type="button"
          className="w-full text-left rounded-xl border border-border/40 bg-surface-1/60 px-4 py-3 transition hover:bg-surface-2/60"
          onClick={() => onNavigate(session.id)}
        >
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground truncate">{session.title}</p>
              <p className="text-xs text-muted-foreground">
                {projectNameById.get(session.projectId ?? "") ??
                  workspaceNameById.get(session.workspaceId) ??
                  "Workspace"}
              </p>
            </div>
            <span className="text-micro text-muted-foreground">
              {new Date(session.createdAt).toLocaleDateString()}
            </span>
          </div>
        </button>
      ))}
    </SearchSection>
  );
}

function TaskResultsSection({
  taskResults,
  isLoading,
  error,
  onNavigate,
}: {
  taskResults: TaskSearchItem[];
  isLoading: boolean;
  error: string | null;
  onNavigate: (sessionId: string) => void;
}) {
  const content = isLoading ? (
    <p className="text-xs text-muted-foreground">Loading tasks...</p>
  ) : (
    taskResults.map((item) => (
      <button
        key={item.task.taskId}
        type="button"
        className="w-full text-left rounded-xl border border-border/40 bg-surface-1/60 px-4 py-3 transition hover:bg-surface-2/60"
        onClick={() => onNavigate(item.sessionId)}
      >
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground truncate">{item.task.title}</p>
            <p className="text-xs text-muted-foreground truncate">
              {item.sessionTitle}
              {item.projectName ? ` · ${item.projectName}` : ""}
            </p>
          </div>
          <StatusPill status={item.task.status} />
        </div>
        <p className="mt-2 text-xs text-muted-foreground line-clamp-2">{item.task.prompt}</p>
      </button>
    ))
  );

  return (
    <SearchSection
      title="Tasks"
      icon={<Clock className="h-4 w-4" aria-hidden="true" />}
      isEmpty={!isLoading && taskResults.length === 0}
    >
      {error ? <p className="text-xs text-warning">{error}</p> : null}
      {content}
    </SearchSection>
  );
}

function ArtifactResultsSection({
  artifactResults,
  isLoading,
  error,
  onNavigate,
}: {
  artifactResults: ArtifactSearchItem[];
  isLoading: boolean;
  error: string | null;
  onNavigate: (sessionId: string) => void;
}) {
  const content = isLoading ? (
    <p className="text-xs text-muted-foreground">Loading artifacts...</p>
  ) : (
    artifactResults.map((item) => (
      <button
        key={item.record.artifactId}
        type="button"
        className="w-full text-left rounded-xl border border-border/40 bg-surface-1/60 px-4 py-3 transition hover:bg-surface-2/60"
        onClick={() => onNavigate(item.record.sessionId)}
      >
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground truncate">{item.record.title}</p>
            <p className="text-xs text-muted-foreground">
              {item.record.taskTitle ?? "Untitled task"}
              {item.record.sessionTitle ? ` · ${item.record.sessionTitle}` : ""}
            </p>
          </div>
          <span className="text-micro uppercase tracking-wider text-muted-foreground">
            {item.record.type}
          </span>
        </div>
        <p className="mt-2 text-xs text-muted-foreground line-clamp-2">{item.snippet}</p>
      </button>
    ))
  );

  return (
    <SearchSection
      title="Artifacts"
      icon={<FileText className="h-4 w-4" aria-hidden="true" />}
      isEmpty={!isLoading && artifactResults.length === 0}
    >
      {error ? <p className="text-xs text-warning">{error}</p> : null}
      {content}
    </SearchSection>
  );
}

function buildSessionResults({
  sessions,
  normalizedQuery,
  projectNameById,
  workspaceNameById,
}: {
  sessions: Session[];
  normalizedQuery: string;
  projectNameById: Map<string, string>;
  workspaceNameById: Map<string, string>;
}): Session[] {
  return sessions.filter((session) =>
    buildSessionSearchText(session, projectNameById, workspaceNameById).includes(normalizedQuery)
  );
}

function buildSessionSearchText(
  session: Session,
  projectNameById: Map<string, string>,
  workspaceNameById: Map<string, string>
): string {
  const projectName = session.projectId ? projectNameById.get(session.projectId) : undefined;
  const workspaceName = workspaceNameById.get(session.workspaceId);
  return [session.title, session.id, projectName, workspaceName]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function buildTaskResults({
  sessions,
  taskCache,
  normalizedQuery,
  projectNameById,
  workspaceNameById,
}: {
  sessions: Session[];
  taskCache: Record<string, CoworkTask[]>;
  normalizedQuery: string;
  projectNameById: Map<string, string>;
  workspaceNameById: Map<string, string>;
}): TaskSearchItem[] {
  const results: TaskSearchItem[] = [];
  for (const session of sessions) {
    const tasks = taskCache[session.id] ?? [];
    for (const task of tasks) {
      if (!buildTaskSearchText(task).includes(normalizedQuery)) {
        continue;
      }
      results.push({
        task,
        sessionId: session.id,
        sessionTitle: session.title,
        projectName: session.projectId ? projectNameById.get(session.projectId) : undefined,
        workspaceName: workspaceNameById.get(session.workspaceId),
      });
    }
  }
  return results;
}

function buildTaskSearchText(task: CoworkTask): string {
  return [task.title, task.prompt].filter(Boolean).join(" ").toLowerCase();
}

function SearchSection({
  title,
  icon,
  isEmpty,
  children,
}: {
  title: string;
  icon: ReactNode;
  isEmpty: boolean;
  children: ReactNode;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
        {icon}
        <span>{title}</span>
      </div>
      {isEmpty ? (
        <p className="text-xs text-muted-foreground">No matches.</p>
      ) : (
        <div className="space-y-2">{children}</div>
      )}
    </div>
  );
}

function StatusPill({ status }: { status: CoworkTaskStatus }) {
  const { label, className } = getStatusStyle(status);
  return (
    <span
      className={cn(
        "text-micro uppercase tracking-wider px-2 py-0.5 rounded-full border",
        className
      )}
    >
      {label}
    </span>
  );
}

function getStatusStyle(status: CoworkTaskStatus): { label: string; className: string } {
  switch (status) {
    case "running":
    case "planning":
      return {
        label: "Running",
        className: "border-warning/40 text-warning bg-warning/10",
      };
    case "queued":
    case "ready":
      return {
        label: "Queued",
        className: "border-border/60 text-muted-foreground bg-surface-2/60",
      };
    case "awaiting_confirmation":
      return {
        label: "Awaiting",
        className: "border-amber-500/40 text-amber-600 bg-amber-500/10",
      };
    case "completed":
      return {
        label: "Completed",
        className: "border-success/40 text-success bg-success/10",
      };
    case "failed":
      return {
        label: "Failed",
        className: "border-destructive/40 text-destructive bg-destructive/10",
      };
    case "cancelled":
      return {
        label: "Cancelled",
        className: "border-border/60 text-muted-foreground bg-surface-2/60",
      };
    default:
      return {
        label: status,
        className: "border-border/60 text-muted-foreground bg-surface-2/60",
      };
  }
}

function buildArtifactSnippet(payload: ArtifactPayload): string {
  switch (payload.type) {
    case "diff":
      return `${payload.file}: ${payload.diff.slice(0, 140)}`;
    case "plan":
      return payload.steps.map((step) => step.label).join(" · ");
    case "markdown":
      return payload.content.slice(0, 160);
    case "preflight":
      return payload.report.riskSummary;
    case "PlanCard":
      return payload.summary || payload.goal;
    case "DiffCard":
      return payload.summary || payload.files.map((file) => file.path).join(", ");
    case "ReportCard":
      return payload.summary;
    case "ChecklistCard":
      return payload.items.map((item) => item.label).join(" · ");
    case "TestReport":
      return payload.summary || `${payload.command} (${payload.status})`;
    case "ReviewReport":
      return payload.summary;
    case "ImageArtifact":
      return payload.sourceTool ?? payload.mimeType;
    case "LayoutGraph":
      return `Nodes: ${payload.nodes.length}, Edges: ${payload.edges.length}`;
    case "VisualDiffReport":
      return `Regions: ${payload.summary.changedRegions}, Max: ${payload.summary.maxScore.toFixed(2)}`;
    default:
      return "Artifact";
  }
}
