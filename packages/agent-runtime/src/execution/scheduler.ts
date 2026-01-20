import type { ExecutionConfig } from "@ku0/agent-runtime-core";
import type { ExecutionTaskQueue } from "./taskQueue";
import type { ExecutionRejectionReason, ExecutionTask } from "./types";
import type { WorkerRegistry } from "./workerRegistry";

export interface SchedulerAssignment {
  taskId: string;
  workerId: string;
}

export interface ExecutionSchedulerContext {
  queue: ExecutionTaskQueue;
  workerRegistry: WorkerRegistry;
  getTask: (taskId: string) => ExecutionTask | undefined;
  canSchedule: (task: ExecutionTask) => boolean;
  reserveQuota: (task: ExecutionTask) => void;
  rejectTask: (task: ExecutionTask, reason: ExecutionRejectionReason) => void;
}

export class ExecutionScheduler {
  private readonly config: ExecutionConfig;

  constructor(config: ExecutionConfig) {
    this.config = config;
  }

  schedule(context: ExecutionSchedulerContext): SchedulerAssignment[] {
    const assignments: SchedulerAssignment[] = [];
    const queueDepth = context.queue.size;
    let scanned = 0;

    const workers = context.workerRegistry.listSchedulableWorkers();
    for (const worker of workers) {
      let available = Math.min(worker.capacity, this.config.maxInFlightPerWorker) - worker.inFlight;
      while (available > 0 && context.queue.size > 0 && scanned < queueDepth) {
        const entry = context.queue.dequeue();
        if (!entry) {
          break;
        }
        scanned += 1;
        const task = context.getTask(entry.taskId);
        if (!task) {
          continue;
        }
        if (!context.canSchedule(task)) {
          context.rejectTask(task, "quota_exceeded");
          continue;
        }

        context.reserveQuota(task);
        assignments.push({ taskId: task.id, workerId: worker.workerId });
        available -= 1;
      }

      if (scanned >= queueDepth) {
        break;
      }
    }

    return assignments;
  }
}
