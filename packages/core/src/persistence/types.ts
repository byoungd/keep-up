export type DocSnapshot = {
  docId: string;
  data: Uint8Array;
  frontierTag: string;
  seq: number;
  createdAt: string;
  sizeBytes: number;
};

export type OpLogEntry = {
  docId: string;
  seq: number;
  data: Uint8Array;
  frontierTag: string;
  parentFrontierTag: string;
  clientId: string;
  timestamp: string;
  sizeBytes: number;
};

export type CompactionPolicy = {
  updateThreshold: number;
  timeThresholdMinutes: number;
  keepRecentUpdates: number;
  maxSnapshotAgeMinutes: number;
};

export type CompactionResult = {
  docId: string;
  newSnapshot: DocSnapshot;
  prunedUpdates: number;
  keptUpdates: number;
  durationMs: number;
  previousSnapshotSeq?: number;
};

export interface StorageBackend {
  getLatestSnapshot(docId: string): Promise<DocSnapshot | null>;
  saveSnapshot(snapshot: DocSnapshot): Promise<void>;
  listSnapshots(docId: string): Promise<DocSnapshot[]>;
  deleteSnapshot(docId: string, seq: number): Promise<void>;
  getUpdates(docId: string, afterSeq?: number): Promise<OpLogEntry[]>;
  getUpdatesSince(docId: string, frontierTag: string): Promise<OpLogEntry[]>;
  appendUpdate(entry: OpLogEntry): Promise<void>;
  deleteUpdates(docId: string, beforeSeq: number): Promise<void>;
  getLatestSeq(docId: string): Promise<number>;
  getCurrentFrontierTag(docId: string): Promise<string>;
  docExists(docId: string): Promise<boolean>;
  listDocs(): Promise<string[]>;
  deleteDoc(docId: string): Promise<void>;
}

export type DocState = {
  docId: string;
  snapshot: DocSnapshot | null;
  updates: OpLogEntry[];
  frontierTag: string;
  totalUpdates: number;
};

export type RecoveryResult = {
  docId: string;
  success: boolean;
  frontierTag: string;
  updatesApplied: number;
  snapshotUsed: boolean;
  error?: string;
};
