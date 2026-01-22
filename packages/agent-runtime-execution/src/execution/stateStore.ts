import type {
  ExecutionLease,
  ExecutionLeaseFilter,
  ExecutionStateStore,
  ExecutionTaskSnapshot,
  ExecutionTaskSnapshotFilter,
} from "@ku0/agent-runtime-core";

export class InMemoryExecutionStateStore implements ExecutionStateStore {
  private readonly leases = new Map<string, ExecutionLease>();
  private readonly snapshots = new Map<string, ExecutionTaskSnapshot[]>();

  async saveLease(lease: ExecutionLease): Promise<void> {
    this.leases.set(lease.leaseId, { ...lease });
  }

  async loadLease(leaseId: string): Promise<ExecutionLease | null> {
    const lease = this.leases.get(leaseId);
    return lease ? { ...lease } : null;
  }

  async listLeases(filter?: ExecutionLeaseFilter): Promise<ExecutionLease[]> {
    let results = Array.from(this.leases.values()).map((lease) => ({ ...lease }));

    if (filter?.status) {
      const statuses = Array.isArray(filter.status) ? filter.status : [filter.status];
      results = results.filter((lease) => statuses.includes(lease.status));
    }

    if (filter?.taskId) {
      results = results.filter((lease) => lease.taskId === filter.taskId);
    }

    if (filter?.workerId) {
      results = results.filter((lease) => lease.workerId === filter.workerId);
    }

    return results;
  }

  async deleteLease(leaseId: string): Promise<void> {
    this.leases.delete(leaseId);
  }

  async saveTaskSnapshot(snapshot: ExecutionTaskSnapshot): Promise<void> {
    const list = this.snapshots.get(snapshot.taskId) ?? [];
    list.push({ ...snapshot });
    this.snapshots.set(snapshot.taskId, list);
  }

  async listTaskSnapshots(filter?: ExecutionTaskSnapshotFilter): Promise<ExecutionTaskSnapshot[]> {
    let results = Array.from(this.snapshots.values())
      .flat()
      .map((snapshot) => ({ ...snapshot }));

    if (filter?.status) {
      const statuses = Array.isArray(filter.status) ? filter.status : [filter.status];
      results = results.filter((snapshot) => statuses.includes(snapshot.status));
    }

    if (filter?.taskId) {
      results = results.filter((snapshot) => snapshot.taskId === filter.taskId);
    }

    if (filter?.afterSequence !== undefined) {
      const afterSequence = filter.afterSequence;
      results = results.filter((snapshot) => snapshot.sequence > afterSequence);
    }

    results.sort((a, b) => a.sequence - b.sequence);

    if (filter?.limit) {
      results = results.slice(0, filter.limit);
    }

    return results;
  }

  async getLatestTaskSnapshots(): Promise<ExecutionTaskSnapshot[]> {
    const latest: ExecutionTaskSnapshot[] = [];

    for (const snapshots of this.snapshots.values()) {
      let maxSnapshot: ExecutionTaskSnapshot | undefined;
      for (const snapshot of snapshots) {
        if (!maxSnapshot || snapshot.sequence > maxSnapshot.sequence) {
          maxSnapshot = snapshot;
        }
      }
      if (maxSnapshot) {
        latest.push({ ...maxSnapshot });
      }
    }

    latest.sort((a, b) => a.sequence - b.sequence);
    return latest;
  }
}
