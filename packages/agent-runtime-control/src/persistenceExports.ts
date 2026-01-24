import type { ExportBundle, ExportFilter, TaskRun, TaskRunFilter } from "@ku0/agent-runtime-core";

export type PersistenceStoreLike = {
  listTaskRuns: (filter?: TaskRunFilter) => TaskRun[];
  exportBundle: (filter?: ExportFilter) => ExportBundle;
};

export type AuditSummary = {
  taskRuns: number;
  toolEvents: number;
  modelEvents: number;
  workspaceEvents: number;
  firstSeenAt?: number;
  lastSeenAt?: number;
};

export function createAuditExportService(store: PersistenceStoreLike) {
  return {
    listTaskRuns: (filter?: TaskRunFilter) => store.listTaskRuns(filter),
    exportBundle: (filter?: ExportFilter) => store.exportBundle(filter),
    getSummary: (filter?: ExportFilter) => buildAuditSummary(store.exportBundle(filter)),
  };
}

export function buildAuditSummary(bundle: ExportBundle): AuditSummary {
  const timestamps: number[] = [];
  for (const run of bundle.taskRuns) {
    timestamps.push(run.startedAt);
    if (run.endedAt) {
      timestamps.push(run.endedAt);
    }
  }
  for (const event of bundle.toolEvents) {
    timestamps.push(event.createdAt);
  }
  for (const event of bundle.modelEvents) {
    timestamps.push(event.createdAt);
  }
  for (const event of bundle.workspaceEvents) {
    timestamps.push(event.createdAt);
  }

  const firstSeenAt = timestamps.length ? Math.min(...timestamps) : undefined;
  const lastSeenAt = timestamps.length ? Math.max(...timestamps) : undefined;

  return {
    taskRuns: bundle.taskRuns.length,
    toolEvents: bundle.toolEvents.length,
    modelEvents: bundle.modelEvents.length,
    workspaceEvents: bundle.workspaceEvents.length,
    firstSeenAt,
    lastSeenAt,
  };
}
