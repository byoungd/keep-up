import { randomUUID } from "node:crypto";
import type { RuntimeEventBus } from "@ku0/agent-runtime-control";
import type { TelemetryContext } from "@ku0/agent-runtime-telemetry/telemetry";
import { AGENT_METRICS } from "@ku0/agent-runtime-telemetry/telemetry";
import { resolveExecutionConfig } from "../runtimeConfig";
import type {
  ExecutionConfig,
  ExecutionQueueClass,
  ExecutionStateStore,
  ExecutionTaskSnapshot,
  ExecutionWorkerState,
} from "../types";
import { getLogger, type RuntimeLogger } from "../utils/logger";
import { ExecutionScheduler } from "./scheduler";
import { ExecutionTaskQueue } from "./taskQueue";
import type {
  ExecutionCancelReason,
  ExecutionRejectionReason,
  ExecutionTask,
  ExecutionTaskDefinition,
  ExecutionTaskFilter,
  ExecutionTaskHandler,
  ExecutionTaskReceipt,
} from "./types";
import { WorkerRegistry } from "./workerRegistry";

export interface ExecutionPoolConfig {
  execution?: Partial<ExecutionConfig>;
  stateStore?: ExecutionStateStore;
  telemetry?: TelemetryContext;
  eventBus?: RuntimeEventBus;
  now?: () => number;
  idFactory?: () => string;
}

interface QuotaReservations {
  model: Map<string, number>;
  tool: Map<string, number>;
}

const DEFAULT_QUEUE_CLASS: ExecutionQueueClass = "normal";
const TERMINAL_STATUSES: ExecutionTaskSnapshot["status"][] = [
  "completed",
  "failed",
  "canceled",
  "rejected",
];

export class ExecutionPool {
  private readonly config: ExecutionConfig;
  private readonly queue: ExecutionTaskQueue;
  private readonly scheduler: ExecutionScheduler;
  private readonly workerRegistry: WorkerRegistry;
  private readonly handlers = new Map<string, ExecutionTaskHandler<unknown, unknown>>();
  private readonly tasks = new Map<string, ExecutionTask>();
  private readonly abortControllers = new Map<string, AbortController>();
  private readonly completionHandlers = new Map<string, Set<(task: ExecutionTask) => void>>();
  private readonly inFlightByModel = new Map<string, number>();
  private readonly inFlightByTool = new Map<string, number>();
  private readonly stateStore?: ExecutionStateStore;
  private readonly telemetry?: TelemetryContext;
  private readonly eventBus?: RuntimeEventBus;
  private readonly now: () => number;
  private readonly idFactory: () => string;
  private readonly logger: RuntimeLogger;
  private sequenceCounter = 0;
  private ticker?: NodeJS.Timeout;
  private tickInProgress = false;

  constructor(config: ExecutionPoolConfig = {}) {
    const resolved = resolveExecutionConfig({ execution: config.execution });

    this.config = resolved;
    this.queue = new ExecutionTaskQueue();
    this.scheduler = new ExecutionScheduler(this.config);
    this.workerRegistry = new WorkerRegistry({
      leaseTtlMs: this.config.leaseTtlMs,
      now: config.now,
      idFactory: config.idFactory,
    });
    this.stateStore = config.stateStore;
    this.telemetry = config.telemetry;
    this.eventBus = config.eventBus;
    this.now = config.now ?? (() => Date.now());
    this.idFactory = config.idFactory ?? (() => randomUUID());
    this.logger = getLogger().child({ module: "execution-pool" });
  }

  registerTaskHandler<TPayload, TResult>(
    type: string,
    handler: ExecutionTaskHandler<TPayload, TResult>
  ): void {
    this.handlers.set(type, handler as ExecutionTaskHandler<unknown, unknown>);
  }

  registerWorker(workerId: string, capacity: number): void {
    this.workerRegistry.registerWorker({ workerId, capacity });
  }

  setWorkerState(workerId: string, state: ExecutionWorkerState): void {
    this.workerRegistry.setWorkerState(workerId, state);
  }

  async heartbeatWorker(workerId: string): Promise<void> {
    const leases = this.workerRegistry.heartbeat(workerId);
    if (!this.stateStore) {
      return;
    }
    for (const lease of leases) {
      await this.stateStore.saveLease(lease);
    }
  }

  async submitTask<TPayload>(
    definition: ExecutionTaskDefinition<TPayload>
  ): Promise<ExecutionTaskReceipt> {
    const queueClass = definition.queueClass ?? DEFAULT_QUEUE_CLASS;
    const taskId = this.nextTaskId();
    const createdAt = this.now();

    const task: ExecutionTask<TPayload> = {
      id: taskId,
      type: definition.type,
      payload: definition.payload,
      name: definition.name,
      queueClass,
      status: "queued",
      attempt: 0,
      createdAt,
      queuedAt: createdAt,
      metadata: definition.metadata,
      modelId: definition.modelId,
      toolName: definition.toolName,
    };

    const backpressure = this.evaluateBackpressure(queueClass);
    if (backpressure) {
      task.status = "rejected";
      task.error = backpressure;
      this.tasks.set(taskId, task as ExecutionTask);
      await this.persistSnapshot(task as ExecutionTask);
      this.emitTaskEvent("task:rejected", { taskId, reason: backpressure });
      return { taskId, accepted: false, status: task.status, reason: backpressure };
    }

    if (!this.handlers.has(definition.type)) {
      task.status = "rejected";
      task.error = "handler_missing";
      this.tasks.set(taskId, task as ExecutionTask);
      await this.persistSnapshot(task as ExecutionTask);
      this.emitTaskEvent("task:rejected", { taskId, reason: "handler_missing" });
      return { taskId, accepted: false, status: task.status, reason: "handler_missing" };
    }

    this.tasks.set(taskId, task as ExecutionTask);
    const sequence = this.nextSequence();
    this.queue.enqueue({
      taskId,
      queueClass,
      sequence,
      enqueuedAt: createdAt,
    });
    await this.persistSnapshot(task as ExecutionTask, sequence);
    this.emitTaskEvent("task:enqueued", { taskId, queueClass, attempt: 0 });
    this.updateQueueDepthMetric();

    return { taskId, accepted: true, status: task.status };
  }

  async cancelTask(
    taskId: string,
    reason: ExecutionCancelReason = "user_cancelled"
  ): Promise<boolean> {
    const task = this.tasks.get(taskId);
    if (!task || TERMINAL_STATUSES.includes(task.status)) {
      return false;
    }

    if (task.status === "queued") {
      this.queue.remove(taskId);
      this.updateQueueDepthMetric();
    }

    const handler = this.handlers.get(task.type);
    if (handler?.cleanup) {
      try {
        await handler.cleanup({
          taskId,
          attempt: task.attempt,
          metadata: task.metadata ?? {},
        });
      } catch (error) {
        this.logger.warn("cleanup failed", {
          taskId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    this.abortControllers.get(taskId)?.abort();
    this.abortControllers.delete(taskId);

    task.status = "canceled";
    task.completedAt = this.now();
    task.error = reason;

    const lease = this.workerRegistry.getLeaseByTask(taskId);
    if (lease) {
      this.workerRegistry.completeLease(lease.leaseId, "canceled");
      await this.persistLease(lease.leaseId);
      this.decrementInFlight(task);
    }

    await this.persistSnapshot(task);
    this.emitTaskEvent("task:cancelled", {
      taskId,
      workerId: task.workerId,
      reason,
    });
    this.notifyComplete(task);
    return true;
  }

  getTask(taskId: string): ExecutionTask | undefined {
    return this.tasks.get(taskId);
  }

  listTasks(filter?: ExecutionTaskFilter): ExecutionTask[] {
    let results = Array.from(this.tasks.values());

    if (filter?.status) {
      const statuses = Array.isArray(filter.status) ? filter.status : [filter.status];
      results = results.filter((task) => statuses.includes(task.status));
    }

    if (filter?.type) {
      const types = Array.isArray(filter.type) ? filter.type : [filter.type];
      results = results.filter((task) => types.includes(task.type));
    }

    if (filter?.queueClass) {
      const classes = Array.isArray(filter.queueClass) ? filter.queueClass : [filter.queueClass];
      results = results.filter((task) => classes.includes(task.queueClass));
    }

    if (filter?.limit) {
      results = results.slice(0, filter.limit);
    }

    return results;
  }

  async waitForTask(taskId: string): Promise<ExecutionTask> {
    const task = this.tasks.get(taskId);
    if (!task) {
      throw new Error(`Task ${taskId} not found`);
    }

    if (TERMINAL_STATUSES.includes(task.status)) {
      return task;
    }

    return new Promise((resolve) => {
      const handlers = this.completionHandlers.get(taskId) ?? new Set();
      handlers.add(resolve);
      this.completionHandlers.set(taskId, handlers);
    });
  }

  start(): void {
    if (this.ticker) {
      return;
    }
    this.ticker = setInterval(() => {
      void this.tick();
    }, this.config.schedulerTickMs);
  }

  stop(): void {
    if (this.ticker) {
      clearInterval(this.ticker);
      this.ticker = undefined;
    }
  }

  async tick(): Promise<void> {
    if (this.tickInProgress) {
      return;
    }
    this.tickInProgress = true;
    try {
      await this.processExpiredLeases();
      await this.scheduleAssignments();
    } finally {
      this.tickInProgress = false;
    }
  }

  async recoverFromStore(): Promise<void> {
    if (!this.stateStore) {
      return;
    }

    const snapshots = await this.stateStore.getLatestTaskSnapshots();
    if (snapshots.length === 0) {
      return;
    }

    const ordered = [...snapshots].sort((a, b) => a.sequence - b.sequence);
    for (const snapshot of ordered) {
      this.sequenceCounter = Math.max(this.sequenceCounter, snapshot.sequence);
      const task: ExecutionTask = {
        id: snapshot.taskId,
        type: snapshot.type,
        payload: snapshot.payload,
        queueClass: snapshot.queueClass,
        status: snapshot.status,
        attempt: snapshot.attempt,
        createdAt: snapshot.timestamp,
        queuedAt: snapshot.timestamp,
        workerId: snapshot.workerId,
        result: snapshot.result,
        error: snapshot.error,
        modelId: snapshot.modelId,
        toolName: snapshot.toolName,
        metadata: snapshot.metadata,
      };
      this.tasks.set(task.id, task);

      if (snapshot.status === "queued" || snapshot.status === "running") {
        if (!this.handlers.has(task.type)) {
          await this.rejectTask(task, "handler_missing");
          continue;
        }
        task.status = "queued";
        task.attempt = snapshot.status === "running" ? snapshot.attempt + 1 : snapshot.attempt;
        task.workerId = undefined;
        task.startedAt = undefined;
        task.completedAt = undefined;
        task.result = undefined;
        task.error = undefined;
        task.queuedAt = this.now();
        const recoveredSnapshot = await this.persistSnapshot(task);
        this.queue.enqueue({
          taskId: task.id,
          queueClass: task.queueClass,
          sequence: recoveredSnapshot?.sequence ?? this.nextSequence(),
          enqueuedAt: task.queuedAt ?? this.now(),
        });
        this.emitTaskEvent("task:requeued", {
          taskId: task.id,
          attempt: task.attempt,
          reason: "lease_expired",
        });
      }
    }

    this.updateQueueDepthMetric();
  }

  listWorkers(): ReturnType<WorkerRegistry["listWorkers"]> {
    return this.workerRegistry.listWorkers();
  }

  getQueueDepth(): number {
    return this.queue.size;
  }

  private async processExpiredLeases(): Promise<void> {
    const expired = this.workerRegistry.collectExpiredLeases(this.now());
    if (expired.length === 0) {
      return;
    }

    for (const lease of expired) {
      await this.persistLease(lease.leaseId);
      const task = this.tasks.get(lease.taskId);
      if (!task || task.status !== "running") {
        continue;
      }
      task.status = "queued";
      task.attempt = lease.attempt + 1;
      task.workerId = undefined;
      task.startedAt = undefined;
      task.completedAt = undefined;
      task.result = undefined;
      task.error = undefined;
      task.queuedAt = this.now();
      this.abortControllers.get(task.id)?.abort();
      this.abortControllers.delete(task.id);
      this.decrementInFlight(task);

      const snapshot = await this.persistSnapshot(task);
      this.queue.enqueue({
        taskId: task.id,
        queueClass: task.queueClass,
        sequence: snapshot?.sequence ?? this.nextSequence(),
        enqueuedAt: task.queuedAt ?? this.now(),
      });
      this.emitTaskEvent("task:requeued", {
        taskId: task.id,
        attempt: task.attempt,
        reason: "lease_expired",
      });
      this.recordPreemptionMetric();
    }

    this.updateQueueDepthMetric();
  }

  private async scheduleAssignments(): Promise<void> {
    const reservations: QuotaReservations = {
      model: new Map(),
      tool: new Map(),
    };
    const rejections: Array<{ task: ExecutionTask; reason: ExecutionRejectionReason }> = [];

    const assignments = this.scheduler.schedule({
      queue: this.queue,
      workerRegistry: this.workerRegistry,
      getTask: (taskId) => this.tasks.get(taskId),
      canSchedule: (task) => this.hasQuotaCapacity(task, reservations),
      reserveQuota: (task) => this.reserveQuota(task, reservations),
      rejectTask: (task, reason) => {
        rejections.push({ task, reason });
      },
    });

    for (const rejection of rejections) {
      await this.rejectTask(rejection.task, rejection.reason);
    }

    if (assignments.length === 0) {
      this.updateQueueDepthMetric();
      return;
    }

    for (const assignment of assignments) {
      const task = this.tasks.get(assignment.taskId);
      if (!task) {
        continue;
      }
      if (!this.handlers.has(task.type)) {
        await this.rejectTask(task, "handler_missing");
        continue;
      }
      await this.startTask(task, assignment.workerId);
    }

    this.updateQueueDepthMetric();
  }

  private async startTask(task: ExecutionTask, workerId: string): Promise<void> {
    const handler = this.handlers.get(task.type);
    if (!handler) {
      await this.rejectTask(task, "handler_missing");
      return;
    }

    const lease = this.workerRegistry.acquireLease(task.id, workerId, task.attempt);
    task.status = "running";
    task.startedAt = this.now();
    task.workerId = workerId;

    this.incrementInFlight(task);
    this.emitTaskEvent("task:started", {
      taskId: task.id,
      workerId,
      attempt: task.attempt,
    });
    this.observeQueueWait(task);
    await this.persistLease(lease.leaseId);
    await this.persistSnapshot(task);

    const abortController = new AbortController();
    this.abortControllers.set(task.id, abortController);

    void this.runTask(task, handler, abortController, lease.leaseId, task.attempt);
  }

  private async runTask(
    task: ExecutionTask,
    handler: ExecutionTaskHandler<unknown, unknown>,
    controller: AbortController,
    leaseId: string,
    attempt: number
  ): Promise<void> {
    try {
      const result = await handler.execute(task.payload, {
        taskId: task.id,
        attempt,
        signal: controller.signal,
        metadata: task.metadata ?? {},
      });
      if (task.status !== "running" || task.attempt !== attempt) {
        return;
      }
      task.status = "completed";
      task.result = result;
      task.completedAt = this.now();
      await this.finalizeTask(task, leaseId);
      this.emitTaskEvent("task:completed", {
        taskId: task.id,
        workerId: task.workerId ?? "",
        durationMs: this.durationMs(task),
      });
    } catch (error) {
      if (task.status !== "running" || task.attempt !== attempt) {
        return;
      }
      const aborted = controller.signal.aborted;
      if (aborted) {
        task.status = "canceled";
        task.error = "signal_aborted";
        task.completedAt = this.now();
        await this.finalizeTask(task, leaseId);
        this.emitTaskEvent("task:cancelled", {
          taskId: task.id,
          workerId: task.workerId,
          reason: "signal_aborted",
        });
        return;
      }
      task.status = "failed";
      task.error = error instanceof Error ? error.message : String(error);
      task.completedAt = this.now();
      await this.finalizeTask(task, leaseId);
      this.emitTaskEvent("task:failed", {
        taskId: task.id,
        workerId: task.workerId,
        error: task.error,
      });
    }
  }

  private async finalizeTask(task: ExecutionTask, leaseId: string): Promise<void> {
    this.workerRegistry.completeLease(leaseId, this.resolveLeaseStatus(task));
    await this.persistLease(leaseId);
    this.decrementInFlight(task);
    this.abortControllers.delete(task.id);
    await this.persistSnapshot(task);
    this.notifyComplete(task);
  }

  private resolveLeaseStatus(task: ExecutionTask): "completed" | "failed" | "canceled" {
    if (task.status === "completed") {
      return "completed";
    }
    if (task.status === "canceled") {
      return "canceled";
    }
    return "failed";
  }

  private async rejectTask(task: ExecutionTask, reason: ExecutionRejectionReason): Promise<void> {
    task.status = "rejected";
    task.error = reason;
    task.completedAt = this.now();
    await this.persistSnapshot(task);
    this.emitTaskEvent("task:rejected", { taskId: task.id, reason });
    this.notifyComplete(task);
  }

  private evaluateBackpressure(queueClass: ExecutionQueueClass): ExecutionRejectionReason | null {
    const depth = this.queue.size;
    if (depth >= this.config.queueDepthLimit) {
      return "queue_full";
    }
    if (depth >= this.config.batchBackpressureThreshold && queueClass === "batch") {
      return "backpressure";
    }
    return null;
  }

  private hasQuotaCapacity(task: ExecutionTask, reservations: QuotaReservations): boolean {
    const quota = this.config.quotaConfig;
    if (!quota) {
      return true;
    }

    if (task.modelId) {
      const limit = quota.models?.[task.modelId] ?? quota.defaultModel;
      if (limit) {
        const used = this.getInFlight(this.inFlightByModel, task.modelId);
        const reserved = this.getInFlight(reservations.model, task.modelId);
        if (used + reserved >= limit.maxInFlight) {
          this.logger.warn("model quota exceeded", {
            taskId: task.id,
            modelId: task.modelId,
            limit: limit.maxInFlight,
          });
          return false;
        }
      }
    }

    if (task.toolName) {
      const limit = quota.tools?.[task.toolName] ?? quota.defaultTool;
      if (limit) {
        const used = this.getInFlight(this.inFlightByTool, task.toolName);
        const reserved = this.getInFlight(reservations.tool, task.toolName);
        if (used + reserved >= limit.maxInFlight) {
          this.logger.warn("tool quota exceeded", {
            taskId: task.id,
            toolName: task.toolName,
            limit: limit.maxInFlight,
          });
          return false;
        }
      }
    }

    return true;
  }

  private reserveQuota(task: ExecutionTask, reservations: QuotaReservations): void {
    if (!this.config.quotaConfig) {
      return;
    }
    if (task.modelId) {
      reservations.model.set(task.modelId, this.getInFlight(reservations.model, task.modelId) + 1);
    }
    if (task.toolName) {
      reservations.tool.set(task.toolName, this.getInFlight(reservations.tool, task.toolName) + 1);
    }
  }

  private incrementInFlight(task: ExecutionTask): void {
    if (task.modelId) {
      this.inFlightByModel.set(
        task.modelId,
        this.getInFlight(this.inFlightByModel, task.modelId) + 1
      );
    }
    if (task.toolName) {
      this.inFlightByTool.set(
        task.toolName,
        this.getInFlight(this.inFlightByTool, task.toolName) + 1
      );
    }
  }

  private decrementInFlight(task: ExecutionTask): void {
    if (task.modelId) {
      this.inFlightByModel.set(
        task.modelId,
        Math.max(0, this.getInFlight(this.inFlightByModel, task.modelId) - 1)
      );
    }
    if (task.toolName) {
      this.inFlightByTool.set(
        task.toolName,
        Math.max(0, this.getInFlight(this.inFlightByTool, task.toolName) - 1)
      );
    }
  }

  private getInFlight(map: Map<string, number>, key: string): number {
    return map.get(key) ?? 0;
  }

  private observeQueueWait(task: ExecutionTask): void {
    if (!this.telemetry) {
      return;
    }
    const start = task.queuedAt ?? task.createdAt;
    const waitMs = this.now() - start;
    this.telemetry.metrics.observe(AGENT_METRICS.executionQueueWait.name, waitMs, {
      queue_class: task.queueClass,
    });
  }

  private updateQueueDepthMetric(): void {
    if (!this.telemetry) {
      return;
    }
    this.telemetry.metrics.gauge(AGENT_METRICS.executionQueueDepth.name, this.queue.size);
  }

  private recordPreemptionMetric(): void {
    if (!this.telemetry) {
      return;
    }
    this.telemetry.metrics.increment(AGENT_METRICS.executionLeasePreemptions.name);
  }

  private async persistSnapshot(
    task: ExecutionTask,
    sequenceOverride?: number
  ): Promise<ExecutionTaskSnapshot | undefined> {
    if (!this.stateStore) {
      return undefined;
    }

    const snapshot: ExecutionTaskSnapshot = {
      taskId: task.id,
      type: task.type,
      queueClass: task.queueClass,
      status: task.status,
      attempt: task.attempt,
      sequence: sequenceOverride ?? this.nextSequence(),
      timestamp: task.completedAt ?? task.startedAt ?? task.queuedAt ?? this.now(),
      payload: task.payload,
      workerId: task.workerId,
      result: task.result,
      error: task.error,
      modelId: task.modelId,
      toolName: task.toolName,
      metadata: task.metadata,
    };

    try {
      await this.stateStore.saveTaskSnapshot(snapshot);
    } catch (error) {
      this.logger.warn("failed to persist task snapshot", {
        taskId: task.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    return snapshot;
  }

  private async persistLease(leaseId: string): Promise<void> {
    if (!this.stateStore) {
      return;
    }
    const lease = this.workerRegistry.getLease(leaseId);
    if (!lease) {
      return;
    }
    await this.stateStore.saveLease(lease);
  }

  private emitTaskEvent(type: Parameters<RuntimeEventBus["emit"]>[0], payload: unknown): void {
    if (!this.eventBus) {
      return;
    }
    this.eventBus.emit(type as never, payload as never, { source: "execution-pool" });
  }

  private notifyComplete(task: ExecutionTask): void {
    const handlers = this.completionHandlers.get(task.id);
    if (!handlers) {
      return;
    }
    for (const handler of handlers) {
      try {
        handler(task);
      } catch {
        // ignore handler errors
      }
    }
    this.completionHandlers.delete(task.id);
  }

  private nextSequence(): number {
    this.sequenceCounter += 1;
    return this.sequenceCounter;
  }

  private nextTaskId(): string {
    return this.idFactory();
  }

  private durationMs(task: ExecutionTask): number {
    if (!task.startedAt) {
      return 0;
    }
    const end = task.completedAt ?? this.now();
    return end - task.startedAt;
  }
}
