export type PersistenceTaskKind = "checkpoint" | "session_state";

export type PersistenceQueueEvent = {
  kind: PersistenceTaskKind;
  status: "retry" | "failed" | "recovered";
  attempts: number;
  error?: string;
  nextRetryAt?: number;
  sessionId: string;
  taskId?: string;
};

type Logger = Pick<Console, "info" | "warn" | "error" | "debug">;

type PersistenceTask = {
  kind: PersistenceTaskKind;
  run: () => Promise<void>;
  attempts: number;
  maxAttempts: number;
  meta: { sessionId: string; taskId?: string };
};

export class PersistenceQueue {
  private readonly queue: PersistenceTask[] = [];
  private processing: Promise<void> | null = null;
  private readonly maxQueueSize: number;
  private readonly maxAttempts: number;
  private readonly baseDelayMs: number;
  private readonly maxDelayMs: number;
  private readonly logger: Logger;
  private readonly emit?: (event: PersistenceQueueEvent) => void;

  constructor(options: {
    logger: Logger;
    emit?: (event: PersistenceQueueEvent) => void;
    maxQueueSize?: number;
    maxAttempts?: number;
    baseDelayMs?: number;
    maxDelayMs?: number;
  }) {
    this.logger = options.logger;
    this.emit = options.emit;
    this.maxQueueSize = options.maxQueueSize ?? 100;
    this.maxAttempts = options.maxAttempts ?? 3;
    this.baseDelayMs = options.baseDelayMs ?? 500;
    this.maxDelayMs = options.maxDelayMs ?? 10_000;
  }

  enqueue(task: Omit<PersistenceTask, "attempts" | "maxAttempts">): void {
    if (this.queue.length >= this.maxQueueSize) {
      const dropped = this.queue.shift();
      if (dropped) {
        this.logger.warn("Dropping persistence task due to queue overflow", {
          kind: dropped.kind,
          sessionId: dropped.meta.sessionId,
          taskId: dropped.meta.taskId,
        });
      }
    }
    this.queue.push({
      ...task,
      attempts: 0,
      maxAttempts: this.maxAttempts,
    });
    this.start();
  }

  async flush(): Promise<void> {
    if (this.processing) {
      await this.processing;
    }
  }

  private start(): void {
    if (!this.processing) {
      this.processing = this.process().finally(() => {
        this.processing = null;
      });
    }
  }

  private async process(): Promise<void> {
    while (this.queue.length > 0) {
      const task = this.queue.shift();
      if (!task) {
        continue;
      }
      await this.execute(task);
    }
  }

  private async execute(task: PersistenceTask): Promise<void> {
    try {
      await task.run();
      if (task.attempts > 0) {
        this.emit?.({
          kind: task.kind,
          status: "recovered",
          attempts: task.attempts,
          sessionId: task.meta.sessionId,
          taskId: task.meta.taskId,
        });
      }
    } catch (error) {
      const attempts = task.attempts + 1;
      if (attempts >= task.maxAttempts) {
        this.emit?.({
          kind: task.kind,
          status: "failed",
          attempts,
          error: error instanceof Error ? error.message : String(error),
          sessionId: task.meta.sessionId,
          taskId: task.meta.taskId,
        });
        this.logger.warn("Persistence task failed after retries", {
          kind: task.kind,
          attempts,
          sessionId: task.meta.sessionId,
          taskId: task.meta.taskId,
        });
        return;
      }

      const delayMs = Math.min(this.baseDelayMs * 2 ** (attempts - 1), this.maxDelayMs);
      const nextRetryAt = Date.now() + delayMs;
      this.emit?.({
        kind: task.kind,
        status: "retry",
        attempts,
        error: error instanceof Error ? error.message : String(error),
        nextRetryAt,
        sessionId: task.meta.sessionId,
        taskId: task.meta.taskId,
      });
      this.logger.warn("Persistence task failed; scheduling retry", {
        kind: task.kind,
        attempts,
        delayMs,
        sessionId: task.meta.sessionId,
        taskId: task.meta.taskId,
      });
      await sleep(delayMs);
      this.queue.push({ ...task, attempts });
    }
  }
}

async function sleep(durationMs: number): Promise<void> {
  if (durationMs <= 0) {
    return;
  }
  await new Promise((resolve) => setTimeout(resolve, durationMs));
}
