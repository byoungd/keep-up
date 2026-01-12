/**
 * Checkpoint/Resume System
 *
 * Provides state persistence and recovery for long-running agent workflows.
 * Enables resuming interrupted operations and crash recovery.
 */

// ============================================================================
// Types
// ============================================================================

/** Checkpoint state version for migration */
export const CHECKPOINT_VERSION = 1;

/** Checkpoint status */
export type CheckpointStatus = "pending" | "completed" | "failed" | "cancelled";

/** Serializable checkpoint data */
export interface Checkpoint {
  /** Unique checkpoint ID */
  id: string;

  /** Version for migration support */
  version: number;

  /** Timestamp when checkpoint was created */
  createdAt: number;

  /** Original task/goal */
  task: string;

  /** Agent type */
  agentType: string;

  /** Agent instance ID */
  agentId: string;

  /** Current status */
  status: CheckpointStatus;

  /** Conversation history (messages) */
  messages: CheckpointMessage[];

  /** Pending tool calls */
  pendingToolCalls: CheckpointToolCall[];

  /** Completed tool calls with results */
  completedToolCalls: CheckpointToolResult[];

  /** Current step/turn number */
  currentStep: number;

  /** Maximum allowed steps */
  maxSteps: number;

  /** Custom metadata */
  metadata: Record<string, unknown>;

  /** Error information if failed */
  error?: {
    message: string;
    code?: string;
    recoverable: boolean;
  };

  /** Parent checkpoint ID (for nested agents) */
  parentCheckpointId?: string;

  /** Child checkpoint IDs */
  childCheckpointIds: string[];
}

/** Serializable message */
export interface CheckpointMessage {
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: number;
}

/** Pending tool call */
export interface CheckpointToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
  timestamp: number;
}

/** Completed tool result */
export interface CheckpointToolResult {
  callId: string;
  name: string;
  arguments: Record<string, unknown>;
  result: unknown;
  success: boolean;
  durationMs: number;
  timestamp: number;
}

/** Checkpoint storage interface */
export interface ICheckpointStorage {
  /** Save a checkpoint */
  save(checkpoint: Checkpoint): Promise<void>;

  /** Load a checkpoint by ID */
  load(id: string): Promise<Checkpoint | null>;

  /** List checkpoints with optional filters */
  list(filter?: CheckpointFilter): Promise<CheckpointSummary[]>;

  /** Delete a checkpoint */
  delete(id: string): Promise<boolean>;

  /** Delete old checkpoints */
  prune(olderThanMs: number): Promise<number>;
}

/** Checkpoint filter options */
export interface CheckpointFilter {
  /** Filter by status */
  status?: CheckpointStatus | CheckpointStatus[];

  /** Filter by agent type */
  agentType?: string;

  /** Filter by creation time (after) */
  createdAfter?: number;

  /** Filter by creation time (before) */
  createdBefore?: number;

  /** Maximum results */
  limit?: number;

  /** Sort order */
  sortBy?: "createdAt" | "status";
  sortOrder?: "asc" | "desc";
}

/** Checkpoint summary (for listing) */
export interface CheckpointSummary {
  id: string;
  task: string;
  agentType: string;
  status: CheckpointStatus;
  createdAt: number;
  currentStep: number;
  maxSteps: number;
  hasError: boolean;
}

/** Checkpoint manager configuration */
export interface CheckpointManagerConfig {
  /** Checkpoint storage implementation */
  storage: ICheckpointStorage;

  /** Auto-checkpoint interval (steps) */
  autoCheckpointInterval?: number;

  /** Maximum checkpoints to keep per agent */
  maxCheckpointsPerAgent?: number;

  /** Auto-prune checkpoints older than (ms) */
  autoPruneOlderThanMs?: number;
}

/** Recovery options */
export interface RecoveryOptions {
  /** Skip completed tool calls */
  skipCompletedTools?: boolean;

  /** Retry failed tool calls */
  retryFailedTools?: boolean;

  /** Maximum retry attempts */
  maxRetries?: number;

  /** Resume from specific step */
  fromStep?: number;
}

/** Recovery result */
export interface RecoveryResult {
  /** Whether recovery succeeded */
  success: boolean;

  /** Recovered checkpoint */
  checkpoint: Checkpoint;

  /** Steps skipped */
  skippedSteps: number;

  /** Steps to replay */
  stepsToReplay: number;

  /** Error if recovery failed */
  error?: string;
}

// ============================================================================
// In-Memory Storage Implementation
// ============================================================================

/**
 * In-memory checkpoint storage (for development/testing).
 */
export class InMemoryCheckpointStorage implements ICheckpointStorage {
  private readonly checkpoints = new Map<string, Checkpoint>();

  async save(checkpoint: Checkpoint): Promise<void> {
    this.checkpoints.set(checkpoint.id, { ...checkpoint });
  }

  async load(id: string): Promise<Checkpoint | null> {
    const checkpoint = this.checkpoints.get(id);
    return checkpoint ? { ...checkpoint } : null;
  }

  async list(filter?: CheckpointFilter): Promise<CheckpointSummary[]> {
    let results = Array.from(this.checkpoints.values());

    // Apply filters
    if (filter?.status) {
      const statuses = Array.isArray(filter.status) ? filter.status : [filter.status];
      results = results.filter((c) => statuses.includes(c.status));
    }

    if (filter?.agentType) {
      results = results.filter((c) => c.agentType === filter.agentType);
    }

    if (filter?.createdAfter) {
      const createdAfter = filter.createdAfter;
      results = results.filter((c) => c.createdAt >= createdAfter);
    }

    if (filter?.createdBefore) {
      const createdBefore = filter.createdBefore;
      results = results.filter((c) => c.createdAt <= createdBefore);
    }

    // Sort
    const sortBy = filter?.sortBy ?? "createdAt";
    const sortOrder = filter?.sortOrder ?? "desc";
    results.sort((a, b) => {
      const aVal = sortBy === "createdAt" ? a.createdAt : a.status;
      const bVal = sortBy === "createdAt" ? b.createdAt : b.status;
      const cmp = aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
      return sortOrder === "asc" ? cmp : -cmp;
    });

    // Limit
    if (filter?.limit) {
      results = results.slice(0, filter.limit);
    }

    // Map to summaries
    return results.map((c) => ({
      id: c.id,
      task: c.task,
      agentType: c.agentType,
      status: c.status,
      createdAt: c.createdAt,
      currentStep: c.currentStep,
      maxSteps: c.maxSteps,
      hasError: !!c.error,
    }));
  }

  async delete(id: string): Promise<boolean> {
    return this.checkpoints.delete(id);
  }

  async prune(olderThanMs: number): Promise<number> {
    const cutoff = Date.now() - olderThanMs;
    let pruned = 0;

    for (const [id, checkpoint] of this.checkpoints) {
      if (checkpoint.createdAt < cutoff) {
        this.checkpoints.delete(id);
        pruned++;
      }
    }

    return pruned;
  }

  /** Get checkpoint count (for testing) */
  get size(): number {
    return this.checkpoints.size;
  }

  /** Clear all checkpoints (for testing) */
  clear(): void {
    this.checkpoints.clear();
  }
}

// ============================================================================
// Checkpoint Manager
// ============================================================================

/**
 * Manages checkpoints for agent workflows.
 */
export class CheckpointManager {
  private readonly storage: ICheckpointStorage;
  private readonly autoCheckpointInterval: number;
  private readonly maxCheckpointsPerAgent: number;
  private readonly autoPruneOlderThanMs: number;

  /** Active checkpoints being tracked */
  private readonly activeCheckpoints = new Map<string, Checkpoint>();

  constructor(config: CheckpointManagerConfig) {
    this.storage = config.storage;
    this.autoCheckpointInterval = config.autoCheckpointInterval ?? 5;
    this.maxCheckpointsPerAgent = config.maxCheckpointsPerAgent ?? 10;
    this.autoPruneOlderThanMs = config.autoPruneOlderThanMs ?? 7 * 24 * 60 * 60 * 1000; // 7 days
  }

  // ==========================================================================
  // Checkpoint Creation
  // ==========================================================================

  /**
   * Create a new checkpoint.
   */
  async create(params: {
    task: string;
    agentType: string;
    agentId: string;
    maxSteps?: number;
    metadata?: Record<string, unknown>;
    parentCheckpointId?: string;
  }): Promise<Checkpoint> {
    const checkpoint: Checkpoint = {
      id: this.generateId(),
      version: CHECKPOINT_VERSION,
      createdAt: Date.now(),
      task: params.task,
      agentType: params.agentType,
      agentId: params.agentId,
      status: "pending",
      messages: [],
      pendingToolCalls: [],
      completedToolCalls: [],
      currentStep: 0,
      maxSteps: params.maxSteps ?? 100,
      metadata: params.metadata ?? {},
      parentCheckpointId: params.parentCheckpointId,
      childCheckpointIds: [],
    };

    // Link to parent if exists
    if (params.parentCheckpointId) {
      const parent = await this.storage.load(params.parentCheckpointId);
      if (parent) {
        parent.childCheckpointIds.push(checkpoint.id);
        await this.storage.save(parent);
      }
    }

    await this.storage.save(checkpoint);
    this.activeCheckpoints.set(checkpoint.id, checkpoint);

    return checkpoint;
  }

  // ==========================================================================
  // Checkpoint Updates
  // ==========================================================================

  /**
   * Add a message to the checkpoint.
   */
  async addMessage(
    checkpointId: string,
    message: Omit<CheckpointMessage, "timestamp">
  ): Promise<void> {
    const checkpoint = await this.getActiveCheckpoint(checkpointId);
    if (!checkpoint) {
      return;
    }

    checkpoint.messages.push({
      ...message,
      timestamp: Date.now(),
    });

    await this.maybeSave(checkpoint);
  }

  /**
   * Record a pending tool call.
   */
  async addPendingToolCall(
    checkpointId: string,
    toolCall: Omit<CheckpointToolCall, "timestamp">
  ): Promise<void> {
    const checkpoint = await this.getActiveCheckpoint(checkpointId);
    if (!checkpoint) {
      return;
    }

    checkpoint.pendingToolCalls.push({
      ...toolCall,
      timestamp: Date.now(),
    });

    await this.maybeSave(checkpoint);
  }

  /**
   * Record a completed tool call.
   */
  async completeToolCall(
    checkpointId: string,
    result: Omit<CheckpointToolResult, "timestamp">
  ): Promise<void> {
    const checkpoint = await this.getActiveCheckpoint(checkpointId);
    if (!checkpoint) {
      return;
    }

    // Remove from pending
    checkpoint.pendingToolCalls = checkpoint.pendingToolCalls.filter(
      (tc) => tc.id !== result.callId
    );

    // Add to completed
    checkpoint.completedToolCalls.push({
      ...result,
      timestamp: Date.now(),
    });

    // Always save after tool completion
    await this.storage.save(checkpoint);
  }

  /**
   * Advance to next step.
   */
  async advanceStep(checkpointId: string): Promise<number> {
    const checkpoint = await this.getActiveCheckpoint(checkpointId);
    if (!checkpoint) {
      return -1;
    }

    checkpoint.currentStep++;

    // Always save step changes
    await this.storage.save(checkpoint);

    return checkpoint.currentStep;
  }

  /**
   * Update checkpoint status.
   */
  async updateStatus(
    checkpointId: string,
    status: CheckpointStatus,
    error?: { message: string; code?: string; recoverable?: boolean }
  ): Promise<void> {
    const checkpoint = await this.getActiveCheckpoint(checkpointId);
    if (!checkpoint) {
      return;
    }

    checkpoint.status = status;

    if (error) {
      checkpoint.error = {
        message: error.message,
        code: error.code,
        recoverable: error.recoverable ?? false,
      };
    }

    await this.storage.save(checkpoint);

    // Remove from active if terminal status
    if (status === "completed" || status === "cancelled") {
      this.activeCheckpoints.delete(checkpointId);
    }
  }

  /**
   * Update checkpoint metadata.
   */
  async updateMetadata(checkpointId: string, metadata: Record<string, unknown>): Promise<void> {
    const checkpoint = await this.getActiveCheckpoint(checkpointId);
    if (!checkpoint) {
      return;
    }

    checkpoint.metadata = { ...checkpoint.metadata, ...metadata };
    await this.maybeSave(checkpoint);
  }

  // ==========================================================================
  // Checkpoint Persistence
  // ==========================================================================

  /**
   * Force save a checkpoint.
   */
  async save(checkpointId: string): Promise<void> {
    const checkpoint = this.activeCheckpoints.get(checkpointId);
    if (checkpoint) {
      await this.storage.save(checkpoint);
    }
  }

  /**
   * Save all active checkpoints.
   */
  async saveAll(): Promise<void> {
    for (const checkpoint of this.activeCheckpoints.values()) {
      await this.storage.save(checkpoint);
    }
  }

  // ==========================================================================
  // Recovery
  // ==========================================================================

  /**
   * Load a checkpoint for recovery.
   */
  async load(checkpointId: string): Promise<Checkpoint | null> {
    return this.storage.load(checkpointId);
  }

  /**
   * Prepare for recovery from a checkpoint.
   */
  async prepareRecovery(
    checkpointId: string,
    options: RecoveryOptions = {}
  ): Promise<RecoveryResult> {
    const checkpoint = await this.storage.load(checkpointId);

    if (!checkpoint) {
      return {
        success: false,
        checkpoint: null as unknown as Checkpoint,
        skippedSteps: 0,
        stepsToReplay: 0,
        error: `Checkpoint ${checkpointId} not found`,
      };
    }

    // Check if checkpoint is recoverable
    if (checkpoint.status === "completed") {
      return {
        success: false,
        checkpoint,
        skippedSteps: checkpoint.currentStep,
        stepsToReplay: 0,
        error: "Checkpoint already completed",
      };
    }

    if (checkpoint.status === "cancelled") {
      return {
        success: false,
        checkpoint,
        skippedSteps: checkpoint.currentStep,
        stepsToReplay: 0,
        error: "Checkpoint was cancelled",
      };
    }

    if (checkpoint.error && !checkpoint.error.recoverable) {
      return {
        success: false,
        checkpoint,
        skippedSteps: checkpoint.currentStep,
        stepsToReplay: 0,
        error: `Non-recoverable error: ${checkpoint.error.message}`,
      };
    }

    // Calculate recovery state
    const fromStep = options.fromStep ?? checkpoint.currentStep;
    const skippedSteps = options.skipCompletedTools ? checkpoint.completedToolCalls.length : 0;
    const stepsToReplay = checkpoint.maxSteps - fromStep;

    // Re-activate the checkpoint
    this.activeCheckpoints.set(checkpoint.id, checkpoint);

    // Clear pending tool calls if retrying
    if (options.retryFailedTools) {
      checkpoint.pendingToolCalls = [];
    }

    return {
      success: true,
      checkpoint,
      skippedSteps,
      stepsToReplay,
    };
  }

  /**
   * Get recoverable checkpoints (failed with recoverable flag).
   */
  async getRecoverableCheckpoints(): Promise<CheckpointSummary[]> {
    const all = await this.storage.list({ status: "failed" });
    const results: CheckpointSummary[] = [];

    for (const summary of all) {
      const full = await this.storage.load(summary.id);
      if (full?.error?.recoverable) {
        results.push(summary);
      }
    }

    return results;
  }

  // ==========================================================================
  // Querying
  // ==========================================================================

  /**
   * List checkpoints.
   */
  async list(filter?: CheckpointFilter): Promise<CheckpointSummary[]> {
    return this.storage.list(filter);
  }

  /**
   * Get pending checkpoints (interrupted workflows).
   */
  async getPendingCheckpoints(): Promise<CheckpointSummary[]> {
    return this.storage.list({ status: "pending" });
  }

  // ==========================================================================
  // Cleanup
  // ==========================================================================

  /**
   * Delete a checkpoint.
   */
  async delete(checkpointId: string): Promise<boolean> {
    this.activeCheckpoints.delete(checkpointId);
    return this.storage.delete(checkpointId);
  }

  /**
   * Prune old checkpoints.
   */
  async prune(): Promise<number> {
    return this.storage.prune(this.autoPruneOlderThanMs);
  }

  /**
   * Dispose the manager.
   */
  async dispose(): Promise<void> {
    await this.saveAll();
    this.activeCheckpoints.clear();
  }

  // ==========================================================================
  // Private Methods
  // ==========================================================================

  private async getActiveCheckpoint(id: string): Promise<Checkpoint | null> {
    let checkpoint = this.activeCheckpoints.get(id);
    if (!checkpoint) {
      checkpoint = (await this.storage.load(id)) ?? undefined;
      if (checkpoint) {
        this.activeCheckpoints.set(id, checkpoint);
      }
    }
    return checkpoint ?? null;
  }

  private async maybeSave(checkpoint: Checkpoint): Promise<void> {
    // Save periodically based on message count
    const totalOps =
      checkpoint.messages.length +
      checkpoint.pendingToolCalls.length +
      checkpoint.completedToolCalls.length;

    if (totalOps % 10 === 0) {
      await this.storage.save(checkpoint);
    }
  }

  private generateId(): string {
    return `ckpt_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  }
}

// ============================================================================
// Factory
// ============================================================================

/**
 * Create a checkpoint manager with in-memory storage.
 */
export function createCheckpointManager(
  config?: Partial<CheckpointManagerConfig>
): CheckpointManager {
  return new CheckpointManager({
    storage: config?.storage ?? new InMemoryCheckpointStorage(),
    autoCheckpointInterval: config?.autoCheckpointInterval,
    maxCheckpointsPerAgent: config?.maxCheckpointsPerAgent,
    autoPruneOlderThanMs: config?.autoPruneOlderThanMs,
  });
}

/**
 * Create in-memory checkpoint storage.
 */
export function createInMemoryCheckpointStorage(): InMemoryCheckpointStorage {
  return new InMemoryCheckpointStorage();
}
