import type {
  ExportBundle,
  ExportFilter,
  ModelEvent,
  PersistenceConfig,
  TaskRun,
  TaskRunFilter,
  ToolEvent,
  WorkspaceEvent,
} from "@ku0/agent-runtime-core";
import type { PersistenceStore } from "./types";

export class InMemoryPersistenceStore implements PersistenceStore {
  private taskRuns = new Map<string, TaskRun>();
  private toolEvents: ToolEvent[] = [];
  private modelEvents: ModelEvent[] = [];
  private workspaceEvents: WorkspaceEvent[] = [];
  private secrets = new Map<string, string>();

  open(_config: PersistenceConfig): void {
    // No-op for in-memory store.
  }

  saveTaskRun(taskRun: TaskRun): void {
    this.taskRuns.set(taskRun.runId, { ...taskRun });
  }

  updateTaskRunStatus(runId: string, status: string, endedAt?: number): void {
    const existing = this.taskRuns.get(runId);
    if (!existing) {
      return;
    }
    this.taskRuns.set(runId, {
      ...existing,
      status: status as TaskRun["status"],
      endedAt: endedAt ?? existing.endedAt,
    });
  }

  listTaskRuns(filter?: TaskRunFilter): TaskRun[] {
    let results = Array.from(this.taskRuns.values());
    if (filter?.runId) {
      results = results.filter((run) => run.runId === filter.runId);
    }
    if (filter?.status) {
      const statuses = Array.isArray(filter.status) ? filter.status : [filter.status];
      results = results.filter((run) => statuses.includes(run.status));
    }
    const startedAfter = filter?.startedAfter;
    if (startedAfter !== undefined) {
      results = results.filter((run) => run.startedAt >= startedAfter);
    }
    const startedBefore = filter?.startedBefore;
    if (startedBefore !== undefined) {
      results = results.filter((run) => run.startedAt <= startedBefore);
    }
    results.sort((a, b) => b.startedAt - a.startedAt);
    if (filter?.limit) {
      results = results.slice(0, filter.limit);
    }
    return results.map((run) => ({ ...run }));
  }

  saveToolEvent(event: ToolEvent): void {
    this.toolEvents.push({ ...event });
  }

  saveModelEvent(event: ModelEvent): void {
    this.modelEvents.push({ ...event });
  }

  saveWorkspaceEvent(event: WorkspaceEvent): void {
    this.workspaceEvents.push({ ...event });
  }

  storeSecret(key: string, plaintext: string): void {
    this.secrets.set(key, plaintext);
  }

  loadSecret(key: string): string | null {
    return this.secrets.get(key) ?? null;
  }

  exportBundle(filter?: ExportFilter): ExportBundle {
    const filterRunId = filter?.runId;
    const filterSessionId = filter?.sessionId;
    const since = filter?.since;
    const until = filter?.until;

    const taskRuns = this.filterByTime(
      this.listTaskRuns(filterRunId ? { runId: filterRunId } : undefined),
      since,
      until,
      (run) => run.startedAt
    );
    const toolEvents = this.filterByTime(
      this.toolEvents.filter((event) => !filterRunId || event.runId === filterRunId),
      since,
      until,
      (event) => event.createdAt
    );
    const modelEvents = this.filterByTime(
      this.modelEvents.filter((event) => !filterRunId || event.runId === filterRunId),
      since,
      until,
      (event) => event.createdAt
    );
    const workspaceEvents = this.filterByTime(
      this.workspaceEvents.filter(
        (event) => !filterSessionId || event.sessionId === filterSessionId
      ),
      since,
      until,
      (event) => event.createdAt
    );

    const limit = filter?.limit;
    return {
      taskRuns: limit ? taskRuns.slice(0, limit) : taskRuns,
      toolEvents: limit ? toolEvents.slice(0, limit) : toolEvents,
      modelEvents: limit ? modelEvents.slice(0, limit) : modelEvents,
      workspaceEvents: limit ? workspaceEvents.slice(0, limit) : workspaceEvents,
    };
  }

  reset(): void {
    this.taskRuns.clear();
    this.toolEvents = [];
    this.modelEvents = [];
    this.workspaceEvents = [];
    this.secrets.clear();
  }

  private filterByTime<T>(
    items: T[],
    since: number | undefined,
    until: number | undefined,
    getTime: (item: T) => number
  ): T[] {
    let output = items;
    if (since !== undefined) {
      output = output.filter((item) => getTime(item) >= since);
    }
    if (until !== undefined) {
      output = output.filter((item) => getTime(item) <= until);
    }
    return output.map((item) => ({ ...(item as object) })) as T[];
  }
}
