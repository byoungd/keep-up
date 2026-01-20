import type { LessonProfile, LessonScope } from "@ku0/agent-runtime";
import React from "react";
import {
  type CoworkLesson,
  createLesson,
  deleteLesson,
  type LessonSearchResult,
  listLessons,
  searchLessons,
  updateLesson,
} from "../../api/coworkApi";
import { useWorkspace } from "../../app/providers/WorkspaceProvider";
import { cn } from "../../lib/cn";

type ScopeFilter = LessonScope | "all";
type ProfileFilter = LessonProfile | "all";

const PROFILE_OPTIONS: Array<{ id: ProfileFilter; label: string }> = [
  { id: "all", label: "All profiles" },
  { id: "default", label: "Default" },
  { id: "strict-reviewer", label: "Strict Reviewer" },
  { id: "creative-prototyper", label: "Creative Prototyper" },
];

const SCOPE_OPTIONS: Array<{ id: ScopeFilter; label: string }> = [
  { id: "all", label: "All scopes" },
  { id: "project", label: "Project" },
  { id: "global", label: "Global" },
];

type LessonDraft = {
  trigger: string;
  rule: string;
  confidence: string;
  scope: LessonScope;
  profile: LessonProfile;
};

type LessonLoadResult = {
  lessons: CoworkLesson[];
  results: LessonSearchResult[];
};

type LessonPayload = {
  trigger: string;
  rule: string;
  confidence?: number;
  scope: LessonScope;
  projectId?: string;
  profile: LessonProfile;
};

export function LessonsPage() {
  const { projects, workspaces, activeProjectId, activeWorkspaceId } = useWorkspace();
  const projectId = activeProjectId ?? activeWorkspaceId ?? undefined;
  const projectLabel = resolveProjectLabel({
    projects,
    workspaces,
    projectId,
    workspaceId: activeWorkspaceId ?? undefined,
  });

  const [scopeFilter, setScopeFilter] = React.useState<ScopeFilter>("project");
  const [profileFilter, setProfileFilter] = React.useState<ProfileFilter>("all");
  const [query, setQuery] = React.useState("");
  const [lessons, setLessons] = React.useState<CoworkLesson[]>([]);
  const [searchResults, setSearchResults] = React.useState<LessonSearchResult[]>([]);
  const [isLoading, setIsLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [selectedLessonId, setSelectedLessonId] = React.useState<string | null>(null);
  const [draft, setDraft] = React.useState<LessonDraft>(() => buildDefaultDraft(scopeFilter));
  const loadCounterRef = React.useRef(0);

  const refreshLessons = React.useCallback(async () => {
    const requestId = loadCounterRef.current + 1;
    loadCounterRef.current = requestId;

    if (!projectId && scopeFilter === "project") {
      applyIfCurrent(requestId, loadCounterRef, () => {
        setLessons([]);
        setSearchResults([]);
        setError(null);
        setIsLoading(false);
      });
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const result = await fetchLessonData({
        query,
        projectId,
        scopeFilter,
        profileFilter,
      });
      applyIfCurrent(requestId, loadCounterRef, () => {
        setLessons(result.lessons);
        setSearchResults(result.results);
      });
    } catch (err) {
      applyIfCurrent(requestId, loadCounterRef, () => {
        setError(err instanceof Error ? err.message : "Failed to load lessons");
      });
    } finally {
      applyIfCurrent(requestId, loadCounterRef, () => {
        setIsLoading(false);
      });
    }
  }, [projectId, query, scopeFilter, profileFilter]);

  React.useEffect(() => {
    void refreshLessons();
  }, [refreshLessons]);

  React.useEffect(() => {
    setDraft((prev) => ({
      ...prev,
      scope: resolveDraftScope(scopeFilter, prev.scope, projectId),
      profile: resolveDraftProfile(profileFilter, prev.profile),
    }));
  }, [scopeFilter, profileFilter, projectId]);

  const handleSelectLesson = React.useCallback((lesson: CoworkLesson) => {
    setSelectedLessonId(lesson.id);
    setDraft({
      trigger: lesson.trigger,
      rule: lesson.rule,
      confidence: lesson.confidence.toFixed(2),
      scope: lesson.scope,
      profile: lesson.profile,
    });
  }, []);

  const handleNewLesson = React.useCallback(() => {
    setSelectedLessonId(null);
    setDraft(buildDefaultDraft(scopeFilter));
  }, [scopeFilter]);

  const handleSaveLesson = React.useCallback(async () => {
    const validationError = validateDraft(draft, projectId);
    if (validationError) {
      setError(validationError);
      return;
    }
    setError(null);
    const payload = buildLessonPayload(draft, projectId);

    try {
      if (selectedLessonId) {
        await updateLesson(selectedLessonId, payload);
      } else {
        await createLesson(payload);
      }
      await refreshLessons();
      handleNewLesson();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save lesson");
    }
  }, [draft, selectedLessonId, projectId, handleNewLesson, refreshLessons]);

  const handleDeleteLesson = React.useCallback(
    async (lessonId: string) => {
      try {
        await deleteLesson(lessonId);
        if (lessonId === selectedLessonId) {
          handleNewLesson();
        }
        await refreshLessons();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to delete lesson");
      }
    },
    [selectedLessonId, handleNewLesson, refreshLessons]
  );

  const items = searchResults.length
    ? searchResults.map((result) => ({
        lesson: result.lesson,
        score: result.score,
      }))
    : lessons.map((lesson) => ({ lesson, score: null }));

  return (
    <div className="page-grid">
      <section className="card-panel space-y-4">
        <div>
          <p className="text-sm font-semibold text-foreground">Adaptive Lessons</p>
          <p className="text-xs text-muted-foreground">
            Preferences learned from feedback, ready to apply on new tasks.
          </p>
        </div>

        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,160px)_minmax(0,200px)]">
          <input
            aria-label="Search lessons"
            className="text-input"
            placeholder="Search triggers or rules..."
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <select
            aria-label="Lesson scope"
            className="text-input"
            value={scopeFilter}
            onChange={(event) => setScopeFilter(event.target.value as ScopeFilter)}
          >
            {SCOPE_OPTIONS.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
          <select
            aria-label="Lesson profile"
            className="text-input"
            value={profileFilter}
            onChange={(event) => setProfileFilter(event.target.value as ProfileFilter)}
          >
            {PROFILE_OPTIONS.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <p className="text-xs text-muted-foreground">
          {scopeFilter === "project" && !projectId
            ? "Select a workspace or project to view scoped lessons."
            : `Active scope: ${projectLabel}`}
        </p>
      </section>

      <section className="card-panel grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,360px)]">
        <div className="space-y-3">
          <LessonList
            items={items}
            isLoading={isLoading}
            error={error}
            selectedId={selectedLessonId}
            onSelect={handleSelectLesson}
            onDelete={handleDeleteLesson}
          />
        </div>

        <div className="rounded-2xl border border-border/40 bg-surface-1/70 p-4 space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-foreground">
                {selectedLessonId ? "Edit lesson" : "New lesson"}
              </p>
              <p className="text-xs text-muted-foreground">
                {selectedLessonId
                  ? "Refine how the agent should respond next time."
                  : "Add a manual rule the agent should follow."}
              </p>
            </div>
            <button
              type="button"
              className="text-xs text-muted-foreground hover:text-foreground"
              onClick={handleNewLesson}
            >
              Reset
            </button>
          </div>

          <div className="space-y-3">
            <label className="text-xs font-semibold text-muted-foreground" htmlFor="lesson-trigger">
              Trigger
            </label>
            <input
              id="lesson-trigger"
              aria-label="Lesson trigger"
              className="text-input"
              placeholder="When the task mentions..."
              value={draft.trigger}
              onChange={(event) => setDraft((prev) => ({ ...prev, trigger: event.target.value }))}
            />
          </div>

          <div className="space-y-3">
            <label className="text-xs font-semibold text-muted-foreground" htmlFor="lesson-rule">
              Rule
            </label>
            <textarea
              id="lesson-rule"
              aria-label="Lesson rule"
              className="text-input min-h-24 resize-none"
              placeholder="Prefer const over let."
              value={draft.rule}
              onChange={(event) => setDraft((prev) => ({ ...prev, rule: event.target.value }))}
            />
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-2">
              <label className="text-xs font-semibold text-muted-foreground" htmlFor="lesson-scope">
                Scope
              </label>
              <select
                id="lesson-scope"
                aria-label="Lesson scope"
                className="text-input"
                value={draft.scope}
                onChange={(event) =>
                  setDraft((prev) => ({ ...prev, scope: event.target.value as LessonScope }))
                }
              >
                <option value="project">Project</option>
                <option value="global">Global</option>
              </select>
            </div>
            <div className="space-y-2">
              <label
                className="text-xs font-semibold text-muted-foreground"
                htmlFor="lesson-profile"
              >
                Profile
              </label>
              <select
                id="lesson-profile"
                aria-label="Lesson profile"
                className="text-input"
                value={draft.profile}
                onChange={(event) =>
                  setDraft((prev) => ({ ...prev, profile: event.target.value as LessonProfile }))
                }
              >
                <option value="default">Default</option>
                <option value="strict-reviewer">Strict Reviewer</option>
                <option value="creative-prototyper">Creative Prototyper</option>
              </select>
            </div>
          </div>

          <div className="space-y-2">
            <label
              className="text-xs font-semibold text-muted-foreground"
              htmlFor="lesson-confidence"
            >
              Confidence (0-1)
            </label>
            <input
              id="lesson-confidence"
              aria-label="Lesson confidence"
              type="number"
              min={0}
              max={1}
              step={0.05}
              className="text-input"
              value={draft.confidence}
              onChange={(event) =>
                setDraft((prev) => ({ ...prev, confidence: event.target.value }))
              }
            />
          </div>

          {error ? <p className="text-xs text-destructive">{error}</p> : null}

          <button
            type="button"
            className={cn(
              "w-full rounded-md px-3 py-2 text-xs font-semibold",
              "bg-primary text-primary-foreground hover:bg-primary/90"
            )}
            onClick={handleSaveLesson}
          >
            {selectedLessonId ? "Save changes" : "Create lesson"}
          </button>
        </div>
      </section>
    </div>
  );
}

type LessonListItem = {
  lesson: CoworkLesson;
  score: number | null;
};

function LessonList({
  items,
  isLoading,
  error,
  selectedId,
  onSelect,
  onDelete,
}: {
  items: LessonListItem[];
  isLoading: boolean;
  error: string | null;
  selectedId: string | null;
  onSelect: (lesson: CoworkLesson) => void;
  onDelete: (id: string) => void;
}) {
  if (isLoading) {
    return (
      <div className="rounded-2xl border border-border/40 bg-surface-1/70 p-6 text-sm text-muted-foreground">
        Loading lessons...
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-destructive/40 bg-destructive/10 p-6 text-sm text-destructive">
        {error}
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="rounded-2xl border border-border/40 bg-surface-1/70 p-6 text-sm text-muted-foreground">
        No lessons yet. Provide feedback to teach the agent.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {items.map((item) => {
        const isSelected = item.lesson.id === selectedId;
        const confidence = Math.round(item.lesson.confidence * 100);
        return (
          <div
            key={item.lesson.id}
            className={cn(
              "rounded-2xl border px-4 py-3 space-y-2 transition",
              isSelected
                ? "border-foreground/40 bg-surface-2"
                : "border-border/40 bg-surface-1/60 hover:border-foreground/30 hover:bg-surface-2/60"
            )}
          >
            <button
              type="button"
              className="w-full text-left space-y-1"
              onClick={() => onSelect(item.lesson)}
            >
              <p className="text-sm font-semibold text-foreground">{item.lesson.rule}</p>
              <p className="text-xs text-muted-foreground line-clamp-2">{item.lesson.trigger}</p>
            </button>
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full border border-border/50 px-2 py-0.5">
                  {item.lesson.scope}
                </span>
                <span className="rounded-full border border-border/50 px-2 py-0.5">
                  {item.lesson.profile}
                </span>
                <span className="rounded-full border border-border/50 px-2 py-0.5">
                  {confidence}%
                </span>
                {item.score !== null ? (
                  <span className="rounded-full border border-border/50 px-2 py-0.5">
                    score {item.score.toFixed(2)}
                  </span>
                ) : null}
              </div>
              <button
                type="button"
                className="text-xs text-muted-foreground hover:text-foreground"
                onClick={() => onDelete(item.lesson.id)}
              >
                Delete
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

type LessonQueryParams = {
  query: string;
  projectId: string | undefined;
  scopeFilter: ScopeFilter;
  profileFilter: ProfileFilter;
};

async function fetchLessonData(params: LessonQueryParams): Promise<LessonLoadResult> {
  const scopedProjectId = params.scopeFilter === "project" ? params.projectId : undefined;
  if (params.query.trim()) {
    const results = await searchLessons({
      query: params.query,
      projectId: scopedProjectId,
      scope: params.scopeFilter,
      profile: params.profileFilter,
      limit: 20,
    });
    return { lessons: [], results };
  }

  const lessons = await listLessons({
    projectId: scopedProjectId,
    scope: params.scopeFilter,
    profile: params.profileFilter,
    limit: 50,
  });
  return { lessons, results: [] };
}

function applyIfCurrent(
  requestId: number,
  ref: React.MutableRefObject<number>,
  action: () => void
): void {
  if (requestId !== ref.current) {
    return;
  }
  action();
}

function buildDefaultDraft(scope: ScopeFilter): LessonDraft {
  return {
    trigger: "",
    rule: "",
    confidence: "0.7",
    scope: scope === "global" ? "global" : "project",
    profile: "default",
  };
}

function validateDraft(draft: LessonDraft, projectId: string | undefined): string | null {
  if (!draft.trigger.trim() || !draft.rule.trim()) {
    return "Trigger and rule are required.";
  }
  if (draft.scope === "project" && !projectId) {
    return "Select a project or workspace for project-scoped lessons.";
  }
  return null;
}

function buildLessonPayload(draft: LessonDraft, projectId: string | undefined): LessonPayload {
  const confidence = Number.parseFloat(draft.confidence);
  return {
    trigger: draft.trigger.trim(),
    rule: draft.rule.trim(),
    confidence: Number.isFinite(confidence) ? confidence : undefined,
    scope: draft.scope,
    projectId: draft.scope === "project" ? projectId : undefined,
    profile: draft.profile,
  };
}

function resolveDraftScope(
  scopeFilter: ScopeFilter,
  current: LessonScope,
  projectId: string | undefined
): LessonScope {
  if (scopeFilter === "global") {
    return "global";
  }
  if (scopeFilter === "project" && projectId) {
    return "project";
  }
  return current;
}

function resolveDraftProfile(profileFilter: ProfileFilter, current: LessonProfile): LessonProfile {
  if (profileFilter !== "all") {
    return profileFilter;
  }
  return current;
}

function resolveProjectLabel(params: {
  projects: Array<{ id: string; name: string }>;
  workspaces: Array<{ id: string; name: string }>;
  projectId: string | undefined;
  workspaceId: string | undefined;
}): string {
  const project = params.projects.find((item) => item.id === params.projectId);
  if (project) {
    return project.name;
  }
  const workspace = params.workspaces.find((item) => item.id === params.workspaceId);
  if (workspace) {
    return workspace.name;
  }
  return "Global";
}
