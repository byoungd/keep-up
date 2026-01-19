/**
 * MessagePack Checkpoint Storage
 *
 * Persists checkpoints to disk using MessagePack with delta encoding.
 */

import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { stableStringify } from "@ku0/core";
import { decode, encode } from "@msgpack/msgpack";

import type {
  Checkpoint,
  CheckpointFilter,
  CheckpointMessage,
  CheckpointStatus,
  CheckpointSummary,
  CheckpointToolCall,
  CheckpointToolResult,
  ICheckpointStorage,
} from "./checkpointManager";

type DeltaList<T> = { mode: "append"; items: T[] } | { mode: "replace"; items: T[] };

export interface CheckpointDelta {
  id: string;
  version: number;
  createdAt: number;
  task?: string;
  agentType?: string;
  agentId?: string;
  status?: CheckpointStatus;
  currentStep?: number;
  maxSteps?: number;
  metadata?: Record<string, unknown>;
  error?: Checkpoint["error"];
  parentCheckpointId?: string;
  childCheckpointIds?: DeltaList<string>;
  messages?: DeltaList<CheckpointMessage>;
  pendingToolCalls?: DeltaList<CheckpointToolCall>;
  completedToolCalls?: DeltaList<CheckpointToolResult>;
}

type StoredCheckpointRecord =
  | { kind: "full"; checkpoint: Checkpoint }
  | { kind: "delta"; baseId: string; delta: CheckpointDelta };

interface CheckpointIndexEntry {
  id: string;
  fileName: string;
  agentId: string;
  agentType: string;
  task: string;
  status: CheckpointStatus;
  createdAt: number;
  currentStep: number;
  maxSteps: number;
  hasError: boolean;
  isDelta: boolean;
  baseId?: string;
  chainLength: number;
}

export interface MessagePackCheckpointStorageConfig {
  rootDir: string;
  maxDeltaChain?: number;
  minDeltaSavingsRatio?: number;
  indexFileName?: string;
}

const DEFAULT_INDEX_FILE = "index.json";
const DEFAULT_MAX_DELTA_CHAIN = 8;
const DEFAULT_MIN_DELTA_SAVINGS_RATIO = 0.85;

export class MessagePackCheckpointStorage implements ICheckpointStorage {
  private readonly rootDir: string;
  private readonly indexPath: string;
  private readonly maxDeltaChain: number;
  private readonly minDeltaSavingsRatio: number;
  private readonly index = new Map<string, CheckpointIndexEntry>();
  private readonly latestByAgent = new Map<string, string>();
  private readonly chainLengthById = new Map<string, number>();
  private loaded = false;

  constructor(config: MessagePackCheckpointStorageConfig) {
    this.rootDir = config.rootDir;
    this.indexPath = join(this.rootDir, config.indexFileName ?? DEFAULT_INDEX_FILE);
    this.maxDeltaChain = config.maxDeltaChain ?? DEFAULT_MAX_DELTA_CHAIN;
    this.minDeltaSavingsRatio = config.minDeltaSavingsRatio ?? DEFAULT_MIN_DELTA_SAVINGS_RATIO;
  }

  async save(checkpoint: Checkpoint): Promise<void> {
    await this.ensureLoaded();
    await mkdir(this.rootDir, { recursive: true });

    const existing = this.index.get(checkpoint.id);
    if (existing) {
      await this.writeRecord(
        checkpoint.id,
        { kind: "full", checkpoint },
        0,
        existing.baseId,
        checkpoint
      );
      return;
    }

    const previousId = this.latestByAgent.get(checkpoint.agentId);
    if (!previousId) {
      await this.writeRecord(checkpoint.id, { kind: "full", checkpoint }, 0, undefined, checkpoint);
      return;
    }

    const previous = await this.load(previousId);
    const previousChain = this.chainLengthById.get(previousId) ?? 0;

    if (!previous || previousChain >= this.maxDeltaChain) {
      await this.writeRecord(checkpoint.id, { kind: "full", checkpoint }, 0, undefined, checkpoint);
      return;
    }

    const delta = createCheckpointDelta(previous, checkpoint);
    const deltaRecord: StoredCheckpointRecord = { kind: "delta", baseId: previousId, delta };
    const deltaSize = encode(deltaRecord).byteLength;
    const fullSize = encode({ kind: "full", checkpoint }).byteLength;

    if (deltaSize >= fullSize * this.minDeltaSavingsRatio) {
      await this.writeRecord(checkpoint.id, { kind: "full", checkpoint }, 0, undefined, checkpoint);
      return;
    }

    await this.writeRecord(checkpoint.id, deltaRecord, previousChain + 1, previousId, checkpoint);
  }

  async load(id: string): Promise<Checkpoint | null> {
    await this.ensureLoaded();
    return this.loadInternal(id, new Set());
  }

  async list(filter?: CheckpointFilter): Promise<CheckpointSummary[]> {
    await this.ensureLoaded();
    let results = Array.from(this.index.values());

    if (filter?.status) {
      const statuses = Array.isArray(filter.status) ? filter.status : [filter.status];
      results = results.filter((entry) => statuses.includes(entry.status));
    }

    if (filter?.agentType) {
      results = results.filter((entry) => entry.agentType === filter.agentType);
    }

    if (filter?.createdAfter) {
      results = results.filter((entry) => entry.createdAt >= filter.createdAfter);
    }

    if (filter?.createdBefore) {
      results = results.filter((entry) => entry.createdAt <= filter.createdBefore);
    }

    const sortBy = filter?.sortBy ?? "createdAt";
    const sortOrder = filter?.sortOrder ?? "desc";
    results.sort((a, b) => {
      const aVal = sortBy === "createdAt" ? a.createdAt : a.status;
      const bVal = sortBy === "createdAt" ? b.createdAt : b.status;
      const cmp = aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
      return sortOrder === "asc" ? cmp : -cmp;
    });

    if (filter?.limit) {
      results = results.slice(0, filter.limit);
    }

    return results.map((entry) => ({
      id: entry.id,
      task: entry.task,
      agentType: entry.agentType,
      status: entry.status,
      createdAt: entry.createdAt,
      currentStep: entry.currentStep,
      maxSteps: entry.maxSteps,
      hasError: entry.hasError,
    }));
  }

  async delete(id: string): Promise<boolean> {
    await this.ensureLoaded();
    const entry = this.index.get(id);
    if (!entry) {
      return false;
    }

    await unlink(this.resolveFilePath(entry.fileName)).catch(() => undefined);
    this.index.delete(id);
    this.chainLengthById.delete(id);

    if (this.latestByAgent.get(entry.agentId) === id) {
      this.latestByAgent.delete(entry.agentId);
      this.rebuildLatestForAgent(entry.agentId);
    }

    await this.persistIndex();
    return true;
  }

  async prune(olderThanMs: number): Promise<number> {
    await this.ensureLoaded();
    const cutoff = Date.now() - olderThanMs;
    const toDelete = Array.from(this.index.values()).filter((entry) => entry.createdAt < cutoff);

    for (const entry of toDelete) {
      await this.delete(entry.id);
    }

    return toDelete.length;
  }

  private async loadInternal(id: string, seen: Set<string>): Promise<Checkpoint | null> {
    if (seen.has(id)) {
      throw new Error(`Checkpoint cycle detected for ${id}`);
    }
    seen.add(id);

    const entry = this.index.get(id);
    if (!entry) {
      return null;
    }

    const record = await this.readRecord(entry.fileName);
    if (record.kind === "full") {
      return record.checkpoint;
    }

    const base = await this.loadInternal(record.baseId, seen);
    if (!base) {
      return null;
    }

    return applyCheckpointDelta(base, record.delta);
  }

  private async writeRecord(
    id: string,
    record: StoredCheckpointRecord,
    chainLength: number,
    baseId: string | undefined,
    checkpoint?: Checkpoint
  ): Promise<void> {
    const fileName = `${id}.${record.kind}.msgpack`;
    await writeFile(this.resolveFilePath(fileName), encode(record));

    const summary = checkpoint ?? (record.kind === "full" ? record.checkpoint : undefined);
    if (!summary) {
      return;
    }

    const entry: CheckpointIndexEntry = {
      id,
      fileName,
      agentId: summary.agentId,
      agentType: summary.agentType,
      task: summary.task,
      status: summary.status,
      createdAt: summary.createdAt,
      currentStep: summary.currentStep,
      maxSteps: summary.maxSteps,
      hasError: Boolean(summary.error),
      isDelta: record.kind === "delta",
      baseId: record.kind === "delta" ? record.baseId : baseId,
      chainLength,
    };

    this.index.set(id, entry);
    if (entry.agentId) {
      this.latestByAgent.set(entry.agentId, id);
    }
    this.chainLengthById.set(id, chainLength);
    await this.persistIndex();
  }

  private resolveFilePath(fileName: string): string {
    return join(this.rootDir, fileName);
  }

  private async readRecord(fileName: string): Promise<StoredCheckpointRecord> {
    const payload = await readFile(this.resolveFilePath(fileName));
    return decode(payload) as StoredCheckpointRecord;
  }

  private async ensureLoaded(): Promise<void> {
    if (this.loaded) {
      return;
    }
    await this.loadIndex();
    this.loaded = true;
  }

  private async loadIndex(): Promise<void> {
    try {
      const raw = await readFile(this.indexPath, "utf-8");
      const parsed = JSON.parse(raw) as { entries: CheckpointIndexEntry[] };
      for (const entry of parsed.entries ?? []) {
        this.index.set(entry.id, entry);
        this.chainLengthById.set(entry.id, entry.chainLength);
        if (!entry.agentId) {
          continue;
        }
        const existingId = this.latestByAgent.get(entry.agentId);
        if (!existingId) {
          this.latestByAgent.set(entry.agentId, entry.id);
          continue;
        }
        const existing = this.index.get(existingId);
        if (!existing || entry.createdAt > existing.createdAt) {
          this.latestByAgent.set(entry.agentId, entry.id);
        }
      }
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== "ENOENT") {
        throw error;
      }
    }
  }

  private async persistIndex(): Promise<void> {
    const entries = Array.from(this.index.values());
    await writeFile(this.indexPath, JSON.stringify({ entries }, null, 2), "utf-8");
  }

  private rebuildLatestForAgent(agentId: string): void {
    const candidates = Array.from(this.index.values()).filter((entry) => entry.agentId === agentId);
    if (candidates.length === 0) {
      return;
    }
    candidates.sort((a, b) => b.createdAt - a.createdAt);
    this.latestByAgent.set(agentId, candidates[0].id);
  }
}

function createCheckpointDelta(base: Checkpoint, next: Checkpoint): CheckpointDelta {
  return {
    id: next.id,
    version: next.version,
    createdAt: next.createdAt,
    task: next.task === base.task ? undefined : next.task,
    agentType: next.agentType === base.agentType ? undefined : next.agentType,
    agentId: next.agentId === base.agentId ? undefined : next.agentId,
    status: next.status === base.status ? undefined : next.status,
    currentStep: next.currentStep === base.currentStep ? undefined : next.currentStep,
    maxSteps: next.maxSteps === base.maxSteps ? undefined : next.maxSteps,
    metadata: shallowEqual(base.metadata, next.metadata) ? undefined : next.metadata,
    error: isErrorEqual(base.error, next.error) ? undefined : next.error,
    parentCheckpointId:
      next.parentCheckpointId === base.parentCheckpointId ? undefined : next.parentCheckpointId,
    childCheckpointIds: collapseDeltaList(
      diffList(base.childCheckpointIds, next.childCheckpointIds, (a, b) => a === b)
    ),
    messages: collapseDeltaList(diffList(base.messages, next.messages, isMessageEqual)),
    pendingToolCalls: collapseDeltaList(
      diffList(base.pendingToolCalls, next.pendingToolCalls, isToolCallEqual)
    ),
    completedToolCalls: collapseDeltaList(
      diffList(base.completedToolCalls, next.completedToolCalls, isToolResultEqual)
    ),
  };
}

function applyCheckpointDelta(base: Checkpoint, delta: CheckpointDelta): Checkpoint {
  return {
    id: delta.id,
    version: delta.version,
    createdAt: delta.createdAt,
    task: delta.task ?? base.task,
    agentType: delta.agentType ?? base.agentType,
    agentId: delta.agentId ?? base.agentId,
    status: delta.status ?? base.status,
    messages: delta.messages ? applyDeltaList(base.messages, delta.messages) : base.messages,
    pendingToolCalls: delta.pendingToolCalls
      ? applyDeltaList(base.pendingToolCalls, delta.pendingToolCalls)
      : base.pendingToolCalls,
    completedToolCalls: delta.completedToolCalls
      ? applyDeltaList(base.completedToolCalls, delta.completedToolCalls)
      : base.completedToolCalls,
    currentStep: delta.currentStep ?? base.currentStep,
    maxSteps: delta.maxSteps ?? base.maxSteps,
    metadata: delta.metadata ?? base.metadata,
    error: delta.error ?? base.error,
    parentCheckpointId: delta.parentCheckpointId ?? base.parentCheckpointId,
    childCheckpointIds: delta.childCheckpointIds
      ? applyDeltaList(base.childCheckpointIds, delta.childCheckpointIds)
      : base.childCheckpointIds,
  };
}

function diffList<T>(previous: T[], next: T[], equals: (a: T, b: T) => boolean): DeltaList<T> {
  if (next.length >= previous.length) {
    for (let i = 0; i < previous.length; i++) {
      if (!equals(previous[i], next[i])) {
        return { mode: "replace", items: next };
      }
    }
    return { mode: "append", items: next.slice(previous.length) };
  }
  return { mode: "replace", items: next };
}

function applyDeltaList<T>(base: T[], delta: DeltaList<T>): T[] {
  if (delta.mode === "append") {
    return [...base, ...delta.items];
  }
  return [...delta.items];
}

function collapseDeltaList<T>(delta: DeltaList<T>): DeltaList<T> | undefined {
  if (delta.mode === "append" && delta.items.length === 0) {
    return undefined;
  }
  return delta;
}

function isMessageEqual(a: CheckpointMessage, b: CheckpointMessage): boolean {
  return a.role === b.role && a.content === b.content && a.timestamp === b.timestamp;
}

function isToolCallEqual(a: CheckpointToolCall, b: CheckpointToolCall): boolean {
  return (
    a.id === b.id &&
    a.name === b.name &&
    a.timestamp === b.timestamp &&
    stableEquals(a.arguments, b.arguments)
  );
}

function isToolResultEqual(a: CheckpointToolResult, b: CheckpointToolResult): boolean {
  return (
    a.callId === b.callId &&
    a.name === b.name &&
    a.success === b.success &&
    a.durationMs === b.durationMs &&
    a.timestamp === b.timestamp &&
    stableEquals(a.arguments, b.arguments) &&
    stableEquals(a.result, b.result)
  );
}

function isErrorEqual(
  a: Checkpoint["error"] | undefined,
  b: Checkpoint["error"] | undefined
): boolean {
  if (!a && !b) {
    return true;
  }
  if (!a || !b) {
    return false;
  }
  return a.message === b.message && a.code === b.code && a.recoverable === b.recoverable;
}

function stableEquals(a: unknown, b: unknown): boolean {
  if (a === b) {
    return true;
  }
  return stableStringify(a) === stableStringify(b);
}

function shallowEqual(a: Record<string, unknown>, b: Record<string, unknown>): boolean {
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) {
    return false;
  }
  for (const key of aKeys) {
    if (a[key] !== b[key]) {
      return false;
    }
  }
  return true;
}
