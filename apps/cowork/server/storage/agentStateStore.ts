import { JsonStore } from "./jsonStore";
import type { AgentStateCheckpointRecord } from "./types";

export class AgentStateCheckpointStore {
  private readonly store: JsonStore<AgentStateCheckpointRecord>;

  constructor(filePath: string) {
    this.store = new JsonStore<AgentStateCheckpointRecord>({
      filePath,
      idKey: "checkpointId",
      fallback: [],
    });
  }

  getAll(): Promise<AgentStateCheckpointRecord[]> {
    return this.store.getAll();
  }

  getById(checkpointId: string): Promise<AgentStateCheckpointRecord | null> {
    return this.store.getById(checkpointId);
  }

  async getBySession(sessionId: string): Promise<AgentStateCheckpointRecord[]> {
    const records = await this.store.getAll();
    return records
      .filter((record) => record.sessionId === sessionId)
      .sort((a, b) => a.createdAt - b.createdAt);
  }

  create(record: AgentStateCheckpointRecord): Promise<AgentStateCheckpointRecord> {
    return this.store.upsert(record);
  }
}

export function createAgentStateCheckpointStore(filePath: string): AgentStateCheckpointStore {
  return new AgentStateCheckpointStore(filePath);
}
