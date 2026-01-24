import {
  computeAuditBundleChecksum,
  type ExportBundle,
  type ExportFilter,
  type TaskRun,
  type TaskRunFilter,
} from "@ku0/agent-runtime-core";

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
    getChecksum: async (filter?: ExportFilter) =>
      computeAuditBundleChecksum(store.exportBundle(filter)),
    exportBundleWithChecksum: async (filter?: ExportFilter) => {
      const bundle = store.exportBundle(filter);
      const checksum = await computeAuditBundleChecksum(bundle);
      return { bundle, checksum };
    },
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
