import type { AgentState } from "@ku0/agent-runtime";
import type { AgentStateCheckpointStoreLike } from "../storage/contracts";

export interface AgentStateManager {
  checkpoint(state: AgentState): Promise<string>;
  restore(checkpointId: string): Promise<AgentState | null>;
}

export class DefaultAgentStateManager implements AgentStateManager {
  private readonly store: AgentStateCheckpointStoreLike;
  private readonly sessionId: string;

  constructor(store: AgentStateCheckpointStoreLike, sessionId: string) {
    this.store = store;
    this.sessionId = sessionId;
  }

  async checkpoint(state: AgentState): Promise<string> {
    const checkpointId = crypto.randomUUID();
    const now = Date.now();
    const cloned = cloneAgentState(state);
    cloned.checkpointId = checkpointId;

    await this.store.create({
      checkpointId,
      sessionId: this.sessionId,
      state: cloned,
      createdAt: now,
      updatedAt: now,
    });

    return checkpointId;
  }

  async restore(checkpointId: string): Promise<AgentState | null> {
    const record = await this.store.getById(checkpointId);
    if (!record || record.sessionId !== this.sessionId) {
      return null;
    }
    return cloneAgentState(record.state);
  }
}

function cloneAgentState(state: AgentState): AgentState {
  if (typeof structuredClone === "function") {
    return structuredClone(state);
  }
  return JSON.parse(JSON.stringify(state)) as AgentState;
}
