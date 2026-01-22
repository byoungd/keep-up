import type { ExecutionQueueClass } from "../types";

interface ExecutionQueueEntry {
  taskId: string;
  queueClass: ExecutionQueueClass;
  sequence: number;
  enqueuedAt: number;
  removed?: boolean;
}

interface QueueLaneState {
  items: ExecutionQueueEntry[];
  head: number;
}

const LANE_ORDER: ExecutionQueueClass[] = ["interactive", "normal", "batch"];
const LANE_WEIGHTS: Record<ExecutionQueueClass, number> = {
  interactive: 5,
  normal: 3,
  batch: 1,
};
const COMPACT_THRESHOLD = 128;

export class ExecutionTaskQueue {
  private readonly lanes = new Map<ExecutionQueueClass, QueueLaneState>();
  private readonly entries = new Map<string, ExecutionQueueEntry>();
  private depth = 0;
  private laneCursor = 0;
  private readonly laneCredits = new Map<ExecutionQueueClass, number>();

  constructor() {
    for (const lane of LANE_ORDER) {
      this.lanes.set(lane, { items: [], head: 0 });
      this.laneCredits.set(lane, LANE_WEIGHTS[lane]);
    }
  }

  get size(): number {
    return this.depth;
  }

  enqueue(entry: Omit<ExecutionQueueEntry, "removed">): void {
    const lane = this.lanes.get(entry.queueClass);
    if (!lane) {
      return;
    }
    const stored: ExecutionQueueEntry = { ...entry };
    lane.items.push(stored);
    this.entries.set(entry.taskId, stored);
    this.depth += 1;
  }

  dequeue(): ExecutionQueueEntry | undefined {
    if (this.depth === 0) {
      return undefined;
    }

    for (let pass = 0; pass < 2; pass += 1) {
      const entry = this.dequeueWithCredits();
      if (entry) {
        this.entries.delete(entry.taskId);
        this.depth = Math.max(0, this.depth - 1);
        return entry;
      }
      this.resetLaneCredits();
    }

    return undefined;
  }

  remove(taskId: string): boolean {
    const entry = this.entries.get(taskId);
    if (!entry) {
      return false;
    }
    entry.removed = true;
    this.entries.delete(taskId);
    this.depth = Math.max(0, this.depth - 1);
    return true;
  }

  has(taskId: string): boolean {
    return this.entries.has(taskId);
  }

  private dequeueFromLane(lane: QueueLaneState): ExecutionQueueEntry | undefined {
    while (lane.head < lane.items.length) {
      const entry = lane.items[lane.head];
      lane.head += 1;
      if (entry && !entry.removed) {
        this.compactLane(lane);
        return entry;
      }
    }
    this.compactLane(lane);
    return undefined;
  }

  private dequeueWithCredits(): ExecutionQueueEntry | undefined {
    let checked = 0;
    while (checked < LANE_ORDER.length) {
      const lane = LANE_ORDER[this.laneCursor];
      this.laneCursor = (this.laneCursor + 1) % LANE_ORDER.length;
      checked += 1;

      const credits = this.laneCredits.get(lane) ?? 0;
      if (credits <= 0) {
        continue;
      }

      const laneState = this.lanes.get(lane);
      if (!laneState) {
        continue;
      }

      const entry = this.dequeueFromLane(laneState);
      if (!entry) {
        continue;
      }

      this.laneCredits.set(lane, credits - 1);
      return entry;
    }

    return undefined;
  }

  private resetLaneCredits(): void {
    for (const lane of LANE_ORDER) {
      this.laneCredits.set(lane, LANE_WEIGHTS[lane]);
    }
  }

  private compactLane(lane: QueueLaneState): void {
    if (lane.head < COMPACT_THRESHOLD || lane.head < lane.items.length / 2) {
      return;
    }
    lane.items = lane.items.slice(lane.head);
    lane.head = 0;
  }
}
