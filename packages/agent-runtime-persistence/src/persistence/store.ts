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
import { getNativePersistenceStore } from "../node";
import { InMemoryPersistenceStore } from "./inMemoryStore";
import type { NativePersistenceStore, NativeTaskRunFilter, PersistenceStore } from "./types";

class NativePersistenceStoreWrapper implements PersistenceStore {
  constructor(private readonly store: NativePersistenceStore) {}

  open(config: PersistenceConfig): void {
    this.store.open(config);
  }

  saveTaskRun(taskRun: TaskRun): void {
    this.store.saveTaskRun(taskRun);
  }

  updateTaskRunStatus(runId: string, status: string, endedAt?: number): void {
    this.store.updateTaskRunStatus(runId, status, endedAt);
  }

  listTaskRuns(filter?: TaskRunFilter): TaskRun[] {
    return this.store.listTaskRuns(normalizeTaskRunFilter(filter));
  }

  saveToolEvent(event: ToolEvent): void {
    this.store.saveToolEvent(event);
  }

  saveModelEvent(event: ModelEvent): void {
    this.store.saveModelEvent(event);
  }

  saveWorkspaceEvent(event: WorkspaceEvent): void {
    this.store.saveWorkspaceEvent(event);
  }

  storeSecret(key: string, plaintext: string): void {
    this.store.storeSecret(key, plaintext);
  }

  loadSecret(key: string): string | null {
    return this.store.loadSecret(key);
  }

  exportBundle(filter?: ExportFilter): ExportBundle {
    return this.store.exportBundle(filter);
  }

  reset(): void {
    this.store.reset();
  }
}

export function createPersistenceStore(config?: PersistenceConfig): PersistenceStore {
  const binding = getNativePersistenceStore();
  const store: PersistenceStore = binding
    ? new NativePersistenceStoreWrapper(new binding.PersistenceStore())
    : new InMemoryPersistenceStore();

  if (config) {
    store.open(config);
  }
  return store;
}

function normalizeTaskRunFilter(filter?: TaskRunFilter): NativeTaskRunFilter | undefined {
  if (!filter) {
    return undefined;
  }
  const status = filter.status
    ? Array.isArray(filter.status)
      ? filter.status
      : [filter.status]
    : undefined;
  return {
    ...filter,
    status,
  };
}
