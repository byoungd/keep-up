import type { CompactionPolicy, CompactionResult, DocSnapshot, StorageBackend } from "./types.js";

export const DEFAULT_COMPACTION_POLICY: CompactionPolicy = {
  updateThreshold: 100,
  timeThresholdMinutes: 30,
  keepRecentUpdates: 10,
  maxSnapshotAgeMinutes: 60,
};

export type CompactionOptions = {
  storage: StorageBackend;
  policy?: CompactionPolicy;
  createSnapshot: (docId: string) => Promise<Uint8Array>;
};

export async function shouldCompact(
  docId: string,
  storage: StorageBackend,
  policy: CompactionPolicy = DEFAULT_COMPACTION_POLICY
): Promise<boolean> {
  const latestSnapshot = await storage.getLatestSnapshot(docId);
  const updates = await storage.getUpdates(docId, latestSnapshot?.seq ?? 0);

  if (updates.length >= policy.updateThreshold) {
    return true;
  }

  if (latestSnapshot) {
    const snapshotAge = Date.now() - new Date(latestSnapshot.createdAt).getTime();
    const maxAge = policy.maxSnapshotAgeMinutes * 60 * 1000;
    if (snapshotAge > maxAge && updates.length > 0) {
      return true;
    }
  }

  return false;
}

export async function runCompaction(
  options: CompactionOptions,
  docId: string
): Promise<CompactionResult> {
  const { storage, policy = DEFAULT_COMPACTION_POLICY, createSnapshot } = options;
  const startTime = Date.now();

  const previousSnapshot = await storage.getLatestSnapshot(docId);
  const allUpdates = await storage.getUpdates(docId);

  const snapshotData = await createSnapshot(docId);
  const frontierTag = await storage.getCurrentFrontierTag(docId);

  const newSnapshot: DocSnapshot = {
    docId,
    data: snapshotData,
    frontierTag,
    seq: (previousSnapshot?.seq ?? 0) + 1,
    createdAt: new Date().toISOString(),
    sizeBytes: snapshotData.length,
  };

  await storage.saveSnapshot(newSnapshot);

  const keepFromSeq = Math.max(0, allUpdates.length - policy.keepRecentUpdates);
  const prunedCount = keepFromSeq;

  if (prunedCount > 0 && allUpdates.length > 0) {
    const pruneBeforeSeq = allUpdates[keepFromSeq]?.seq ?? 0;
    await storage.deleteUpdates(docId, pruneBeforeSeq);
  }

  return {
    docId,
    newSnapshot,
    prunedUpdates: prunedCount,
    keptUpdates: Math.min(allUpdates.length, policy.keepRecentUpdates),
    durationMs: Date.now() - startTime,
    previousSnapshotSeq: previousSnapshot?.seq,
  };
}

export class CompactionScheduler {
  private timers = new Map<string, ReturnType<typeof setInterval>>();
  private options: CompactionOptions;
  private policy: CompactionPolicy;

  constructor(options: CompactionOptions) {
    this.options = options;
    this.policy = options.policy ?? DEFAULT_COMPACTION_POLICY;
  }

  start(docId: string): void {
    if (this.timers.has(docId)) {
      return;
    }

    const interval = this.policy.timeThresholdMinutes * 60 * 1000;
    const timer = setInterval(async () => {
      if (await shouldCompact(docId, this.options.storage, this.policy)) {
        await runCompaction(this.options, docId);
      }
    }, interval);

    this.timers.set(docId, timer);
  }

  stop(docId: string): void {
    const timer = this.timers.get(docId);
    if (timer) {
      clearInterval(timer);
      this.timers.delete(docId);
    }
  }

  stopAll(): void {
    for (const timer of this.timers.values()) {
      clearInterval(timer);
    }
    this.timers.clear();
  }

  async checkAndCompact(docId: string): Promise<CompactionResult | null> {
    if (await shouldCompact(docId, this.options.storage, this.policy)) {
      return runCompaction(this.options, docId);
    }
    return null;
  }
}
