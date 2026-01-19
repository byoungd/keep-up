import { randomUUID } from "node:crypto";

export type CheckpointTrigger = "auto" | "tool" | "turn" | "manual";

export interface CheckpointThread {
  /** Thread identifier */
  threadId: string;
  /** Parent thread for branching */
  parentThreadId?: string;
  /** Thread metadata */
  metadata: {
    name?: string;
    createdAt: number;
    updatedAt: number;
    checkpointCount: number;
  };
}

export interface CheckpointState {
  /** Conversation messages */
  messages: unknown[];
  /** Agent memory state */
  memory?: unknown;
  /** Tool execution history */
  toolHistory?: unknown[];
  /** Custom state data */
  custom?: Record<string, unknown>;
}

export interface CheckpointMetadata {
  /** Human-readable label */
  label?: string;
  /** Trigger source */
  trigger: CheckpointTrigger;
  /** Compression applied */
  compressed: boolean;
  /** Size in bytes */
  sizeBytes: number;
}

export interface Checkpoint {
  /** Unique checkpoint ID */
  id: string;
  /** Thread this checkpoint belongs to */
  threadId: string;
  /** Parent checkpoint for history */
  parentId?: string;
  /** Checkpoint timestamp */
  timestamp: number;
  /** State data */
  state: CheckpointState;
  /** Metadata */
  metadata: CheckpointMetadata;
}

export interface CheckpointListOptions {
  limit?: number;
  before?: number;
  after?: number;
  order?: "asc" | "desc";
}

export interface ThreadListOptions {
  limit?: number;
  order?: "asc" | "desc";
}

export interface CheckpointSaver {
  /** Save a checkpoint */
  save(checkpoint: Checkpoint): Promise<void>;
  /** Get checkpoint by ID */
  get(checkpointId: string): Promise<Checkpoint | undefined>;
  /** Get latest checkpoint for thread */
  getLatest(threadId: string): Promise<Checkpoint | undefined>;
  /** List checkpoints for thread */
  list(threadId: string, options?: CheckpointListOptions): Promise<Checkpoint[]>;
  /** Delete checkpoint */
  delete(checkpointId: string): Promise<void>;
  /** Delete all checkpoints for thread */
  deleteThread(threadId: string): Promise<void>;
}

export interface CheckpointThreadStore {
  saveThread(thread: CheckpointThread): Promise<void>;
  getThread(threadId: string): Promise<CheckpointThread | undefined>;
  listThreads(options?: ThreadListOptions): Promise<CheckpointThread[]>;
  deleteThread(threadId: string): Promise<void>;
}

export interface CheckpointFrequencyConfig {
  minIntervalMs: number;
}

export class CheckpointScheduler {
  private readonly minIntervalMs: number;
  private lastCheckpointAt: number;

  constructor(config: CheckpointFrequencyConfig, now: number = Date.now()) {
    this.minIntervalMs = config.minIntervalMs;
    this.lastCheckpointAt = now;
  }

  shouldCheckpoint(now: number = Date.now()): boolean {
    return now - this.lastCheckpointAt >= this.minIntervalMs;
  }

  markCheckpoint(timestamp: number = Date.now()): void {
    this.lastCheckpointAt = timestamp;
  }
}

export interface CheckpointThreadManagerConfig {
  saver: CheckpointSaver;
  threadStore?: CheckpointThreadStore;
  frequency?: CheckpointFrequencyConfig;
  now?: () => number;
}

export class CheckpointThreadManager {
  private readonly saver: CheckpointSaver;
  private readonly threadStore: CheckpointThreadStore;
  private readonly now: () => number;
  private readonly frequency?: CheckpointFrequencyConfig;
  private readonly schedulerByThread = new Map<string, CheckpointScheduler>();

  constructor(config: CheckpointThreadManagerConfig) {
    this.saver = config.saver;
    this.threadStore = resolveThreadStore(config.saver, config.threadStore);
    this.now = config.now ?? (() => Date.now());
    this.frequency = config.frequency;
    if (config.frequency) {
      this.schedulerByThread.set("default", new CheckpointScheduler(config.frequency));
    }
  }

  async createThread(options: {
    name?: string;
    parentThreadId?: string;
  }): Promise<CheckpointThread> {
    const now = this.now();
    const thread: CheckpointThread = {
      threadId: `thread_${randomUUID()}`,
      parentThreadId: options.parentThreadId,
      metadata: {
        name: options.name,
        createdAt: now,
        updatedAt: now,
        checkpointCount: 0,
      },
    };
    await this.threadStore.saveThread(thread);
    if (this.frequency) {
      this.schedulerByThread.set(thread.threadId, new CheckpointScheduler(this.frequency, now));
    }
    return thread;
  }

  async getThread(threadId: string): Promise<CheckpointThread | undefined> {
    return this.threadStore.getThread(threadId);
  }

  async listThreads(options?: ThreadListOptions): Promise<CheckpointThread[]> {
    return this.threadStore.listThreads(options);
  }

  shouldCheckpoint(threadId: string): boolean {
    let scheduler = this.schedulerByThread.get(threadId) ?? this.schedulerByThread.get("default");
    if (!scheduler && this.frequency) {
      scheduler = new CheckpointScheduler(this.frequency, this.now());
      this.schedulerByThread.set(threadId, scheduler);
    }
    return scheduler ? scheduler.shouldCheckpoint(this.now()) : true;
  }

  async saveCheckpoint(input: {
    threadId: string;
    state: CheckpointState;
    metadata: Omit<CheckpointMetadata, "compressed" | "sizeBytes"> & {
      compressed?: boolean;
      sizeBytes?: number;
    };
  }): Promise<Checkpoint> {
    if (!this.shouldCheckpoint(input.threadId)) {
      throw new Error(`Checkpoint skipped for thread ${input.threadId}`);
    }

    const timestamp = this.now();
    const parent = await this.saver.getLatest(input.threadId);
    const sizeBytes = input.metadata.sizeBytes ?? estimateStateSize(input.state);

    const checkpoint: Checkpoint = {
      id: `ckpt_${randomUUID()}`,
      threadId: input.threadId,
      parentId: parent?.id,
      timestamp,
      state: input.state,
      metadata: {
        label: input.metadata.label,
        trigger: input.metadata.trigger,
        compressed: input.metadata.compressed ?? false,
        sizeBytes,
      },
    };

    await this.saver.save(checkpoint);
    const scheduler =
      this.schedulerByThread.get(input.threadId) ?? this.schedulerByThread.get("default");
    scheduler?.markCheckpoint(timestamp);

    return checkpoint;
  }
}

export class InMemoryCheckpointStore implements CheckpointSaver, CheckpointThreadStore {
  private readonly checkpoints = new Map<string, Checkpoint>();
  private readonly threads = new Map<string, CheckpointThread>();
  private readonly byThread = new Map<string, string[]>();

  async saveThread(thread: CheckpointThread): Promise<void> {
    this.threads.set(thread.threadId, { ...thread });
  }

  async getThread(threadId: string): Promise<CheckpointThread | undefined> {
    const thread = this.threads.get(threadId);
    return thread ? { ...thread, metadata: { ...thread.metadata } } : undefined;
  }

  async listThreads(options?: ThreadListOptions): Promise<CheckpointThread[]> {
    const order = options?.order ?? "desc";
    const limit = options?.limit;
    const threads = Array.from(this.threads.values());
    threads.sort((a, b) =>
      order === "asc"
        ? a.metadata.updatedAt - b.metadata.updatedAt
        : b.metadata.updatedAt - a.metadata.updatedAt
    );
    const sliced = typeof limit === "number" ? threads.slice(0, limit) : threads;
    return sliced.map((thread) => ({
      ...thread,
      metadata: { ...thread.metadata },
    }));
  }

  async save(checkpoint: Checkpoint): Promise<void> {
    this.checkpoints.set(checkpoint.id, cloneCheckpoint(checkpoint));
    const thread =
      this.threads.get(checkpoint.threadId) ??
      createFallbackThread(checkpoint.threadId, checkpoint.timestamp);
    const updatedThread = {
      ...thread,
      metadata: {
        ...thread.metadata,
        updatedAt: checkpoint.timestamp,
        checkpointCount: thread.metadata.checkpointCount + 1,
      },
    };
    this.threads.set(checkpoint.threadId, updatedThread);

    const list = this.byThread.get(checkpoint.threadId) ?? [];
    if (!list.includes(checkpoint.id)) {
      list.push(checkpoint.id);
      this.byThread.set(checkpoint.threadId, list);
    }
  }

  async get(checkpointId: string): Promise<Checkpoint | undefined> {
    const checkpoint = this.checkpoints.get(checkpointId);
    return checkpoint ? cloneCheckpoint(checkpoint) : undefined;
  }

  async getLatest(threadId: string): Promise<Checkpoint | undefined> {
    const checkpoints = await this.list(threadId, { limit: 1, order: "desc" });
    return checkpoints[0];
  }

  async list(threadId: string, options?: CheckpointListOptions): Promise<Checkpoint[]> {
    const ids = this.byThread.get(threadId) ?? [];
    const entries = ids
      .map((id) => this.checkpoints.get(id))
      .filter((checkpoint): checkpoint is Checkpoint => Boolean(checkpoint));

    let filtered = entries;
    if (options?.before !== undefined) {
      filtered = filtered.filter((checkpoint) => checkpoint.timestamp < options.before);
    }
    if (options?.after !== undefined) {
      filtered = filtered.filter((checkpoint) => checkpoint.timestamp > options.after);
    }

    const order = options?.order ?? "desc";
    filtered.sort((a, b) =>
      order === "asc" ? a.timestamp - b.timestamp : b.timestamp - a.timestamp
    );

    const limit = options?.limit;
    const sliced = typeof limit === "number" ? filtered.slice(0, limit) : filtered;
    return sliced.map((checkpoint) => cloneCheckpoint(checkpoint));
  }

  async delete(checkpointId: string): Promise<void> {
    const checkpoint = this.checkpoints.get(checkpointId);
    if (!checkpoint) {
      return;
    }

    this.checkpoints.delete(checkpointId);
    const list = this.byThread.get(checkpoint.threadId) ?? [];
    this.byThread.set(
      checkpoint.threadId,
      list.filter((id) => id !== checkpointId)
    );

    const thread = this.threads.get(checkpoint.threadId);
    if (thread) {
      this.threads.set(checkpoint.threadId, {
        ...thread,
        metadata: {
          ...thread.metadata,
          checkpointCount: Math.max(0, thread.metadata.checkpointCount - 1),
          updatedAt: Date.now(),
        },
      });
    }
  }

  async deleteThread(threadId: string): Promise<void> {
    const ids = this.byThread.get(threadId) ?? [];
    for (const id of ids) {
      this.checkpoints.delete(id);
    }
    this.byThread.delete(threadId);
    this.threads.delete(threadId);
  }
}

function resolveThreadStore(
  saver: CheckpointSaver,
  threadStore?: CheckpointThreadStore
): CheckpointThreadStore {
  if (threadStore) {
    return threadStore;
  }

  if (isThreadStore(saver)) {
    return saver;
  }

  throw new Error("CheckpointThreadStore is required to manage threads");
}

function isThreadStore(
  value: CheckpointSaver | CheckpointThreadStore
): value is CheckpointThreadStore {
  return typeof (value as CheckpointThreadStore).saveThread === "function";
}

function createFallbackThread(threadId: string, timestamp: number): CheckpointThread {
  return {
    threadId,
    metadata: {
      createdAt: timestamp,
      updatedAt: timestamp,
      checkpointCount: 0,
    },
  };
}

function cloneCheckpoint(checkpoint: Checkpoint): Checkpoint {
  return {
    ...checkpoint,
    metadata: { ...checkpoint.metadata },
  };
}

function estimateStateSize(state: CheckpointState): number {
  return Buffer.byteLength(JSON.stringify(state));
}
