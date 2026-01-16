import { JsonStore } from "./jsonStore";
import type { CoworkArtifactRecord } from "./types";

export class ArtifactStore {
  private readonly store: JsonStore<CoworkArtifactRecord>;

  constructor(filePath: string) {
    this.store = new JsonStore<CoworkArtifactRecord>({
      filePath,
      idKey: "artifactId",
      fallback: [],
    });
  }

  getAll(): Promise<CoworkArtifactRecord[]> {
    return this.store.getAll();
  }

  getById(artifactId: string): Promise<CoworkArtifactRecord | null> {
    return this.store.getById(artifactId);
  }

  async getBySession(sessionId: string): Promise<CoworkArtifactRecord[]> {
    const items = await this.store.getAll();
    return items.filter((artifact) => artifact.sessionId === sessionId);
  }

  async getByTask(taskId: string): Promise<CoworkArtifactRecord[]> {
    const items = await this.store.getAll();
    return items.filter((artifact) => artifact.taskId === taskId);
  }

  upsert(artifact: CoworkArtifactRecord): Promise<CoworkArtifactRecord> {
    return this.store.upsert(artifact);
  }

  delete(artifactId: string): Promise<boolean> {
    return this.store.delete(artifactId);
  }
}

export function createArtifactStore(filePath: string): ArtifactStore {
  return new ArtifactStore(filePath);
}
