import { randomUUID } from "node:crypto";
import type {
  Checkpoint,
  CheckpointSaver,
  CheckpointState,
  CheckpointThread,
} from "../checkpoint/threads";

export interface NavigationResult {
  checkpoint: Checkpoint;
  diff?: StateDiff;
  availableActions: NavigationAction[];
}

export type NavigationAction =
  | { type: "forward"; targetId: string }
  | { type: "backward"; targetId: string }
  | { type: "branch"; fromId: string }
  | { type: "replay"; fromId: string; toId: string };

export interface ReplayStep {
  checkpointId: string;
  timestamp: number;
  state: CheckpointState;
}

export interface StateDiffEntry {
  path: string;
  from: unknown;
  to: unknown;
}

export interface StateDiff {
  entries: StateDiffEntry[];
}

export interface StateApplier {
  apply(state: CheckpointState): Promise<void>;
}

export class TimeTravelNavigator {
  constructor(
    private readonly checkpointSaver: CheckpointSaver,
    private readonly stateApplier: StateApplier
  ) {}

  async navigateTo(checkpointId: string): Promise<NavigationResult> {
    const checkpoint = await this.checkpointSaver.get(checkpointId);
    if (!checkpoint) {
      throw new Error(`Checkpoint ${checkpointId} not found`);
    }

    await this.stateApplier.apply(checkpoint.state);
    const actions = await this.getAvailableActions(checkpoint);

    return { checkpoint, availableActions: actions };
  }

  async getDiff(fromId: string, toId: string): Promise<StateDiff> {
    const [from, to] = await Promise.all([
      this.checkpointSaver.get(fromId),
      this.checkpointSaver.get(toId),
    ]);

    if (!from || !to) {
      throw new Error("Checkpoint not found");
    }

    return this.calculateDiff(from.state, to.state);
  }

  async replay(
    fromId: string,
    toId: string,
    options?: { speed?: number; onStep?: (step: ReplayStep) => void }
  ): Promise<void> {
    const path = await this.findPath(fromId, toId);

    for (const checkpoint of path) {
      await this.stateApplier.apply(checkpoint.state);
      options?.onStep?.({
        checkpointId: checkpoint.id,
        timestamp: checkpoint.timestamp,
        state: checkpoint.state,
      });

      if (options?.speed) {
        await sleep(options.speed);
      }
    }
  }

  async branch(fromId: string, branchName?: string): Promise<CheckpointThread> {
    const parent = await this.checkpointSaver.get(fromId);
    if (!parent) {
      throw new Error(`Checkpoint ${fromId} not found`);
    }

    return {
      threadId: `thread_${randomUUID()}`,
      parentThreadId: parent.threadId,
      metadata: {
        name: branchName,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        checkpointCount: 0,
      },
    };
  }

  private async getAvailableActions(checkpoint: Checkpoint): Promise<NavigationAction[]> {
    const list = await this.checkpointSaver.list(checkpoint.threadId, { order: "asc" });
    const index = list.findIndex((entry) => entry.id === checkpoint.id);
    if (index === -1) {
      return [{ type: "branch", fromId: checkpoint.id }];
    }

    const actions: NavigationAction[] = [{ type: "branch", fromId: checkpoint.id }];

    if (index > 0) {
      actions.push({ type: "backward", targetId: list[index - 1].id });
    }

    if (index < list.length - 1) {
      actions.push({ type: "forward", targetId: list[index + 1].id });
      actions.push({ type: "replay", fromId: checkpoint.id, toId: list[list.length - 1].id });
    }

    return actions;
  }

  private async findPath(fromId: string, toId: string): Promise<Checkpoint[]> {
    const from = await this.checkpointSaver.get(fromId);
    const to = await this.checkpointSaver.get(toId);

    if (!from || !to) {
      throw new Error("Checkpoint not found");
    }

    if (from.threadId !== to.threadId) {
      throw new Error("Cross-thread replay is not supported");
    }

    const list = await this.checkpointSaver.list(from.threadId, { order: "asc" });
    const startIndex = list.findIndex((entry) => entry.id === fromId);
    const endIndex = list.findIndex((entry) => entry.id === toId);

    if (startIndex === -1 || endIndex === -1) {
      throw new Error("Checkpoint not found in thread history");
    }

    if (startIndex <= endIndex) {
      return list.slice(startIndex, endIndex + 1);
    }

    return list.slice(endIndex, startIndex + 1).reverse();
  }

  private calculateDiff(from: CheckpointState, to: CheckpointState): StateDiff {
    const entries: StateDiffEntry[] = [];
    diffValue("", from, to, entries);
    return { entries };
  }
}

function diffValue(path: string, from: unknown, to: unknown, entries: StateDiffEntry[]): void {
  if (Object.is(from, to)) {
    return;
  }

  if (isPlainObject(from) && isPlainObject(to)) {
    const keys = new Set([...Object.keys(from), ...Object.keys(to)]);
    for (const key of keys) {
      diffValue(joinPath(path, key), from[key], to[key], entries);
    }
    return;
  }

  if (Array.isArray(from) && Array.isArray(to)) {
    const max = Math.max(from.length, to.length);
    for (let i = 0; i < max; i += 1) {
      diffValue(joinPath(path, String(i)), from[i], to[i], entries);
    }
    return;
  }

  entries.push({ path: path || "<root>", from, to });
}

function joinPath(base: string, key: string): string {
  if (!base) {
    return key;
  }
  return `${base}.${key}`;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
