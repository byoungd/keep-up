import { randomUUID } from "node:crypto";
import type {
  ExecutionLease,
  ExecutionLeaseStatus,
  ExecutionWorkerState,
  WorkerStatus,
} from "../types";

export interface WorkerRegistryConfig {
  leaseTtlMs: number;
  now?: () => number;
  idFactory?: () => string;
}

export interface WorkerRegistration {
  workerId: string;
  capacity: number;
  state?: ExecutionWorkerState;
}

export class WorkerRegistry {
  private readonly workers = new Map<string, WorkerStatus>();
  private readonly leases = new Map<string, ExecutionLease>();
  private readonly leaseByTask = new Map<string, string>();
  private readonly leasesByWorker = new Map<string, Set<string>>();
  private readonly now: () => number;
  private readonly leaseTtlMs: number;
  private readonly idFactory: () => string;

  constructor(config: WorkerRegistryConfig) {
    this.now = config.now ?? (() => Date.now());
    this.leaseTtlMs = config.leaseTtlMs;
    this.idFactory = config.idFactory ?? (() => randomUUID());
  }

  registerWorker(input: WorkerRegistration): WorkerStatus {
    const now = this.now();
    const existing = this.workers.get(input.workerId);
    if (existing) {
      existing.capacity = input.capacity;
      existing.state = input.state ?? existing.state;
      existing.lastSeenAt = now;
      this.workers.set(existing.workerId, existing);
      return existing;
    }

    const worker: WorkerStatus = {
      workerId: input.workerId,
      capacity: input.capacity,
      inFlight: 0,
      state: input.state ?? "idle",
      lastSeenAt: now,
    };
    this.workers.set(worker.workerId, worker);
    return worker;
  }

  setWorkerState(workerId: string, state: ExecutionWorkerState): void {
    const worker = this.workers.get(workerId);
    if (!worker) {
      return;
    }
    worker.state = state;
    this.workers.set(workerId, worker);
  }

  heartbeat(workerId: string): ExecutionLease[] {
    const now = this.now();
    const worker = this.workers.get(workerId);
    if (!worker) {
      return [];
    }
    worker.lastSeenAt = now;
    this.workers.set(workerId, worker);

    const leaseIds = this.leasesByWorker.get(workerId);
    if (!leaseIds) {
      return [];
    }

    const refreshed: ExecutionLease[] = [];
    for (const leaseId of leaseIds) {
      const lease = this.leases.get(leaseId);
      if (!lease || lease.status !== "running") {
        continue;
      }
      lease.lastHeartbeatAt = now;
      lease.expiresAt = now + this.leaseTtlMs;
      refreshed.push({ ...lease });
    }

    return refreshed;
  }

  acquireLease(taskId: string, workerId: string, attempt: number): ExecutionLease {
    const worker = this.workers.get(workerId);
    if (!worker) {
      throw new Error(`Worker ${workerId} not registered`);
    }

    const now = this.now();
    const lease: ExecutionLease = {
      leaseId: this.idFactory(),
      taskId,
      workerId,
      status: "running",
      acquiredAt: now,
      expiresAt: now + this.leaseTtlMs,
      lastHeartbeatAt: now,
      attempt,
    };

    this.leases.set(lease.leaseId, lease);
    this.leaseByTask.set(taskId, lease.leaseId);

    const workerLeases = this.leasesByWorker.get(workerId) ?? new Set<string>();
    workerLeases.add(lease.leaseId);
    this.leasesByWorker.set(workerId, workerLeases);

    worker.inFlight += 1;
    this.updateWorkerBusyState(worker);
    this.workers.set(worker.workerId, worker);

    return lease;
  }

  completeLease(leaseId: string, status: ExecutionLeaseStatus): ExecutionLease | undefined {
    const lease = this.leases.get(leaseId);
    if (!lease || lease.status !== "running") {
      return lease;
    }

    lease.status = status;
    this.leases.set(leaseId, lease);
    this.leaseByTask.delete(lease.taskId);

    const workerLeases = this.leasesByWorker.get(lease.workerId);
    if (workerLeases) {
      workerLeases.delete(leaseId);
      if (workerLeases.size === 0) {
        this.leasesByWorker.delete(lease.workerId);
      }
    }

    const worker = this.workers.get(lease.workerId);
    if (worker) {
      worker.inFlight = Math.max(0, worker.inFlight - 1);
      this.updateWorkerBusyState(worker);
      this.workers.set(worker.workerId, worker);
    }

    return lease;
  }

  getWorker(workerId: string): WorkerStatus | undefined {
    return this.workers.get(workerId);
  }

  listWorkers(): WorkerStatus[] {
    return Array.from(this.workers.values());
  }

  listSchedulableWorkers(): WorkerStatus[] {
    return Array.from(this.workers.values())
      .filter((worker) => worker.state !== "draining")
      .sort((a, b) => {
        if (a.inFlight !== b.inFlight) {
          return a.inFlight - b.inFlight;
        }
        if (a.lastSeenAt !== b.lastSeenAt) {
          return a.lastSeenAt - b.lastSeenAt;
        }
        return a.workerId.localeCompare(b.workerId);
      });
  }

  getLease(leaseId: string): ExecutionLease | undefined {
    return this.leases.get(leaseId);
  }

  getLeaseByTask(taskId: string): ExecutionLease | undefined {
    const leaseId = this.leaseByTask.get(taskId);
    return leaseId ? this.leases.get(leaseId) : undefined;
  }

  listLeases(): ExecutionLease[] {
    return Array.from(this.leases.values());
  }

  collectExpiredLeases(now: number = this.now()): ExecutionLease[] {
    const expired: ExecutionLease[] = [];
    for (const lease of this.leases.values()) {
      if (lease.status !== "running") {
        continue;
      }
      if (lease.expiresAt > now) {
        continue;
      }
      lease.status = "failed";
      expired.push({ ...lease });
      this.leases.set(lease.leaseId, lease);
      this.leaseByTask.delete(lease.taskId);

      const workerLeases = this.leasesByWorker.get(lease.workerId);
      if (workerLeases) {
        workerLeases.delete(lease.leaseId);
        if (workerLeases.size === 0) {
          this.leasesByWorker.delete(lease.workerId);
        }
      }

      const worker = this.workers.get(lease.workerId);
      if (worker) {
        worker.inFlight = Math.max(0, worker.inFlight - 1);
        this.updateWorkerBusyState(worker);
        this.workers.set(worker.workerId, worker);
      }
    }

    return expired;
  }

  private updateWorkerBusyState(worker: WorkerStatus): void {
    if (worker.state === "draining") {
      return;
    }
    worker.state = worker.inFlight > 0 ? "busy" : "idle";
  }
}
