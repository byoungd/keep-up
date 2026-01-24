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

export type NativeTaskRunFilter = Omit<TaskRunFilter, "status"> & {
  status?: string[];
};

export type NativePersistenceStore = {
  open: (config: PersistenceConfig) => void;
  saveTaskRun: (taskRun: TaskRun) => void;
  updateTaskRunStatus: (runId: string, status: string, endedAt?: number) => void;
  listTaskRuns: (filter?: NativeTaskRunFilter) => TaskRun[];
  saveToolEvent: (event: ToolEvent) => void;
  saveModelEvent: (event: ModelEvent) => void;
  saveWorkspaceEvent: (event: WorkspaceEvent) => void;
  storeSecret: (key: string, plaintext: string) => void;
  loadSecret: (key: string) => string | null;
  exportBundle: (filter?: ExportFilter) => ExportBundle;
  reset: () => void;
};

export type NativePersistenceBinding = {
  PersistenceStore: new () => NativePersistenceStore;
};

export type PersistenceStore = {
  open: (config: PersistenceConfig) => void;
  saveTaskRun: (taskRun: TaskRun) => void;
  updateTaskRunStatus: (runId: string, status: string, endedAt?: number) => void;
  listTaskRuns: (filter?: TaskRunFilter) => TaskRun[];
  saveToolEvent: (event: ToolEvent) => void;
  saveModelEvent: (event: ModelEvent) => void;
  saveWorkspaceEvent: (event: WorkspaceEvent) => void;
  storeSecret: (key: string, plaintext: string) => void;
  loadSecret: (key: string) => string | null;
  exportBundle: (filter?: ExportFilter) => ExportBundle;
  reset: () => void;
};
