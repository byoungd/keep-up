import type { CoworkProject } from "@ku0/agent-runtime";
import type { ProjectStoreLike } from "./contracts";
import { JsonStore } from "./jsonStore";

export class ProjectStore implements ProjectStoreLike {
  private readonly store: JsonStore<CoworkProject>;

  constructor(filePath: string) {
    this.store = new JsonStore<CoworkProject>({
      filePath,
      idKey: "projectId",
      fallback: [],
    });
  }

  getAll(): Promise<CoworkProject[]> {
    return this.store.getAll();
  }

  getById(projectId: string): Promise<CoworkProject | null> {
    return this.store.getById(projectId);
  }

  create(project: CoworkProject): Promise<CoworkProject> {
    return this.store.upsert(project);
  }

  update(
    projectId: string,
    updater: (project: CoworkProject) => CoworkProject
  ): Promise<CoworkProject | null> {
    return this.store.update(projectId, updater);
  }

  delete(projectId: string): Promise<boolean> {
    return this.store.delete(projectId);
  }
}

export function createProjectStore(filePath: string): ProjectStore {
  return new ProjectStore(filePath);
}
