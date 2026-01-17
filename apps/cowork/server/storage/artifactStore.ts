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

  async getAll(): Promise<CoworkArtifactRecord[]> {
    const items = await this.store.getAll();
    return items.map(normalizeArtifactRecord);
  }

  async getById(artifactId: string): Promise<CoworkArtifactRecord | null> {
    const record = await this.store.getById(artifactId);
    return record ? normalizeArtifactRecord(record) : null;
  }

  async getBySession(sessionId: string): Promise<CoworkArtifactRecord[]> {
    const items = await this.store.getAll();
    return items
      .filter((artifact) => artifact.sessionId === sessionId)
      .map(normalizeArtifactRecord);
  }

  async getByTask(taskId: string): Promise<CoworkArtifactRecord[]> {
    const items = await this.store.getAll();
    return items.filter((artifact) => artifact.taskId === taskId).map(normalizeArtifactRecord);
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

function normalizeArtifactRecord(record: CoworkArtifactRecord): CoworkArtifactRecord {
  return {
    ...record,
    version: record.version ?? 1,
    status: record.status ?? "pending",
  };
}
