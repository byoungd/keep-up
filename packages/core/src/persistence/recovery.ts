import { LfccError } from "../errors";
import type { RecoveryResult, StorageBackend } from "./types";

export type RecoveryOptions = {
  storage: StorageBackend;
  applySnapshot: (docId: string, data: Uint8Array) => Promise<void>;
  applyUpdate: (docId: string, data: Uint8Array) => Promise<string>;
};

export async function recoverDoc(options: RecoveryOptions, docId: string): Promise<RecoveryResult> {
  const { storage, applySnapshot, applyUpdate } = options;

  try {
    const snapshot = await storage.getLatestSnapshot(docId);
    let frontierTag = "";
    let updatesApplied = 0;

    if (snapshot) {
      await applySnapshot(docId, snapshot.data);
      frontierTag = snapshot.frontierTag;
    }

    const updates = snapshot
      ? await storage.getUpdates(docId, snapshot.seq)
      : await storage.getUpdates(docId);

    for (const update of updates) {
      frontierTag = await applyUpdate(docId, update.data);
      updatesApplied++;
    }

    return {
      docId,
      success: true,
      frontierTag,
      updatesApplied,
      snapshotUsed: !!snapshot,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Recovery failed";
    const lfccError =
      error instanceof LfccError
        ? error
        : new LfccError("RECOVERY_FAILED", message, {
            context: { docId },
            cause: error,
          });
    return {
      docId,
      success: false,
      frontierTag: "",
      updatesApplied: 0,
      snapshotUsed: false,
      error: lfccError.message,
    };
  }
}

export async function verifyRecovery(
  storage: StorageBackend,
  docId: string,
  expectedFrontierTag: string
): Promise<boolean> {
  const currentTag = await storage.getCurrentFrontierTag(docId);
  return currentTag === expectedFrontierTag;
}

export async function getRecoveryState(
  storage: StorageBackend,
  docId: string
): Promise<{
  hasSnapshot: boolean;
  snapshotSeq: number;
  pendingUpdates: number;
  frontierTag: string;
}> {
  const snapshot = await storage.getLatestSnapshot(docId);
  const updates = snapshot
    ? await storage.getUpdates(docId, snapshot.seq)
    : await storage.getUpdates(docId);

  return {
    hasSnapshot: !!snapshot,
    snapshotSeq: snapshot?.seq ?? 0,
    pendingUpdates: updates.length,
    frontierTag: await storage.getCurrentFrontierTag(docId),
  };
}
