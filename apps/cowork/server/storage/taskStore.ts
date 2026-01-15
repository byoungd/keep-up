import type { CoworkTask } from "@ku0/agent-runtime";
import { JsonStore } from "./jsonStore";

export class TaskStore {
  private readonly store: JsonStore<CoworkTask>;

  constructor(filePath: string) {
    this.store = new JsonStore<CoworkTask>({
      filePath,
      idKey: "taskId",
      fallback: [],
    });
  }

  getAll(): Promise<CoworkTask[]> {
    return this.store.getAll();
  }

  getById(taskId: string): Promise<CoworkTask | null> {
    return this.store.getById(taskId);
  }

  getBySession(sessionId: string): Promise<CoworkTask[]> {
    return this.store
      .getAll()
      .then((items) => items.filter((task) => task.sessionId === sessionId));
  }

  create(task: CoworkTask): Promise<CoworkTask> {
    return this.store.upsert(task);
  }

  update(taskId: string, updater: (task: CoworkTask) => CoworkTask): Promise<CoworkTask | null> {
    return this.store.update(taskId, updater);
  }
}

export function createTaskStore(filePath: string): TaskStore {
  return new TaskStore(filePath);
}
