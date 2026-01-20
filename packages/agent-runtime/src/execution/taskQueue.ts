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
const COMPACT_THRESHOLD = 128;

export class ExecutionTaskQueue {
  private readonly lanes = new Map<ExecutionQueueClass, QueueLaneState>();
  private readonly entries = new Map<string, ExecutionQueueEntry>();
  private depth = 0;

  constructor() {
    for (const lane of LANE_ORDER) {
      this.lanes.set(lane, { items: [], head: 0 });
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
    for (const lane of LANE_ORDER) {
      const laneState = this.lanes.get(lane);
      if (!laneState) {
        continue;
      }
      const entry = this.dequeueFromLane(laneState);
      if (entry) {
        this.entries.delete(entry.taskId);
        this.depth = Math.max(0, this.depth - 1);
        return entry;
      }
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

  private compactLane(lane: QueueLaneState): void {
    if (lane.head < COMPACT_THRESHOLD || lane.head < lane.items.length / 2) {
      return;
    }
    lane.items = lane.items.slice(lane.head);
    lane.head = 0;
  }
}
