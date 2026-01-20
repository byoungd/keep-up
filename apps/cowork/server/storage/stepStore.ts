import { JsonStore } from "./jsonStore";
import type { CoworkTaskStepRecord } from "./types";

export class StepStore {
  private readonly store: JsonStore<CoworkTaskStepRecord>;

  constructor(filePath: string) {
    this.store = new JsonStore<CoworkTaskStepRecord>({
      filePath,
      idKey: "stepId",
      fallback: [],
    });
  }

  getAll(): Promise<CoworkTaskStepRecord[]> {
    return this.store.getAll();
  }

  getById(stepId: string): Promise<CoworkTaskStepRecord | null> {
    return this.store.getById(stepId);
  }

  getByTask(taskId: string): Promise<CoworkTaskStepRecord[]> {
    return this.store.getAll().then((items) => items.filter((step) => step.taskId === taskId));
  }

  create(step: CoworkTaskStepRecord): Promise<CoworkTaskStepRecord> {
    return this.store.upsert(step);
  }

  update(
    stepId: string,
    updater: (step: CoworkTaskStepRecord) => CoworkTaskStepRecord
  ): Promise<CoworkTaskStepRecord | null> {
    return this.store.update(stepId, updater);
  }
}

export function createStepStore(filePath: string): StepStore {
  return new StepStore(filePath);
}
