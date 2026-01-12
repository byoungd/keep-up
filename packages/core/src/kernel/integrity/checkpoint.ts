/**
 * LFCC v0.9 RC - Checkpoint Scheduler
 * @see docs/product/Local-First_Collaboration_Contract_v0.9_RC.md §10
 */

import type { IntegrityPolicy } from "../policy/types";
import { computeChainHash, computeContextHash } from "./hash";
import type {
  ChainData,
  CheckpointFailure,
  CheckpointResult,
  CheckpointSchedulerState,
  SpanData,
} from "./types";

/** Annotation with spans for verification */
export type AnnotationForVerify = {
  anno_id: string;
  spans: Array<{
    span_id: string;
    block_id: string;
    text: string;
    expected_context_hash: string | null;
  }>;
  chain: {
    block_ids: string[];
    policy_kind: "strict_adjacency" | "required_order" | "bounded_gap";
    max_intervening_blocks: number;
    expected_chain_hash: string | null;
  };
};

/**
 * Create initial checkpoint scheduler state
 */
export function createCheckpointSchedulerState(): CheckpointSchedulerState {
  return {
    ops_since_last: 0,
    last_checkpoint_ms: Date.now(),
    pending: false,
  };
}

/**
 * Check if a checkpoint should be triggered
 */
export function shouldTriggerCheckpoint(
  state: CheckpointSchedulerState,
  policy: IntegrityPolicy,
  nowMs: number = Date.now()
): boolean {
  if (!policy.checkpoint.enabled) {
    return false;
  }

  // Trigger by ops count
  if (state.ops_since_last >= policy.checkpoint.every_ops) {
    return true;
  }

  // Trigger by time
  const elapsed = nowMs - state.last_checkpoint_ms;
  if (elapsed >= policy.checkpoint.every_ms) {
    return true;
  }

  return false;
}

/**
 * Record an operation and check if checkpoint needed
 */
export function recordOperation(
  state: CheckpointSchedulerState,
  policy: IntegrityPolicy
): { state: CheckpointSchedulerState; shouldCheckpoint: boolean } {
  const newState: CheckpointSchedulerState = {
    ...state,
    ops_since_last: state.ops_since_last + 1,
  };

  const shouldCheckpoint = shouldTriggerCheckpoint(newState, policy);

  return { state: newState, shouldCheckpoint };
}

/**
 * Reset scheduler state after checkpoint
 */
export function resetAfterCheckpoint(_state: CheckpointSchedulerState): CheckpointSchedulerState {
  return {
    ops_since_last: 0,
    last_checkpoint_ms: Date.now(),
    pending: false,
  };
}

/**
 * Build index of annotations by block ID for incremental verification
 * PERF-002: Enables O(1) lookup of affected annotations
 */
function buildAnnotationIndexForVerify(
  annotations: AnnotationForVerify[]
): Map<string, Set<string>> {
  const index = new Map<string, Set<string>>();

  for (const anno of annotations) {
    // Index by span block IDs
    for (const span of anno.spans) {
      let blockSet = index.get(span.block_id);
      if (!blockSet) {
        blockSet = new Set();
        index.set(span.block_id, blockSet);
      }
      blockSet.add(anno.anno_id);
    }

    // Also index by chain block IDs (for chain hash verification)
    for (const blockId of anno.chain.block_ids) {
      let blockSet = index.get(blockId);
      if (!blockSet) {
        blockSet = new Set();
        index.set(blockId, blockSet);
      }
      blockSet.add(anno.anno_id);
    }
  }

  return index;
}

/**
 * Find annotations affected by changed blocks
 * PERF-002: Returns only annotation IDs that need verification
 */
function findAffectedAnnotationIds(
  index: Map<string, Set<string>>,
  changedBlockIds: string[]
): Set<string> {
  const affected = new Set<string>();

  for (const blockId of changedBlockIds) {
    const annotationIds = index.get(blockId);
    if (annotationIds) {
      for (const id of annotationIds) {
        affected.add(id);
      }
    }
  }

  return affected;
}

/**
 * Run a verification checkpoint on annotations
 *
 * PERF-002: Supports incremental verification when changedBlockIds is provided.
 * If changedBlockIds is provided, only annotations referencing those blocks are verified.
 * Otherwise, all annotations are verified (full scan).
 */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: checkpoint logic
export async function runCheckpoint(
  annotations: AnnotationForVerify[],
  policy: IntegrityPolicy,
  options?: {
    /** PERF-002: Only verify annotations affected by these block changes */
    changedBlockIds?: string[];
  }
): Promise<CheckpointResult> {
  const failures: CheckpointFailure[] = [];
  let spans_verified = 0;
  let spans_failed = 0;
  let chains_verified = 0;
  let chains_failed = 0;

  // PERF-002: Filter to affected annotations if incremental mode
  let annotationsToVerify = annotations;
  if (options?.changedBlockIds && options.changedBlockIds.length > 0) {
    const index = buildAnnotationIndexForVerify(annotations);
    const affectedIds = findAffectedAnnotationIds(index, options.changedBlockIds);
    annotationsToVerify = annotations.filter((anno) => affectedIds.has(anno.anno_id));
  }

  for (const anno of annotationsToVerify) {
    // Verify context hashes if enabled
    if (policy.context_hash.enabled) {
      for (const span of anno.spans) {
        if (span.expected_context_hash === null) {
          // No hash to verify - skip
          continue;
        }

        const spanData: SpanData = {
          span_id: span.span_id,
          block_id: span.block_id,
          text: span.text,
        };

        const result = await computeContextHash(spanData);

        if (result.hash === span.expected_context_hash) {
          spans_verified++;
        } else {
          spans_failed++;
          failures.push({
            anno_id: anno.anno_id,
            span_id: span.span_id,
            kind: "context_hash_mismatch",
            detail: `Expected ${span.expected_context_hash}, got ${result.hash}`,
          });
        }
      }
    }

    // Verify chain hash if enabled
    if (policy.chain_hash.enabled && anno.chain.expected_chain_hash !== null) {
      const chainData: ChainData = {
        policy_kind: anno.chain.policy_kind,
        max_intervening_blocks: anno.chain.max_intervening_blocks,
        block_ids: anno.chain.block_ids,
      };

      const result = await computeChainHash(chainData);

      if (result.hash === anno.chain.expected_chain_hash) {
        chains_verified++;
      } else {
        chains_failed++;
        failures.push({
          anno_id: anno.anno_id,
          kind: "chain_hash_mismatch",
          detail: `Expected ${anno.chain.expected_chain_hash}, got ${result.hash}`,
        });
      }
    }
  }

  return {
    timestamp: Date.now(),
    spans_verified,
    spans_failed,
    chains_verified,
    chains_failed,
    failures,
  };
}

/**
 * Checkpoint scheduler class for managing verification timing
 */
export class CheckpointScheduler {
  private state: CheckpointSchedulerState;
  private policy: IntegrityPolicy;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private onCheckpoint: () => Promise<void>;

  constructor(policy: IntegrityPolicy, onCheckpoint: () => Promise<void>) {
    this.state = createCheckpointSchedulerState();
    this.policy = policy;
    this.onCheckpoint = onCheckpoint;

    if (policy.checkpoint.enabled) {
      this.scheduleTimer();
    }
  }

  /**
   * Record an operation
   */
  recordOp(): void {
    const { state, shouldCheckpoint } = recordOperation(this.state, this.policy);
    this.state = state;

    if (shouldCheckpoint && !this.state.pending) {
      this.triggerCheckpoint();
    }
  }

  /**
   * Force an immediate checkpoint
   */
  async forceCheckpoint(): Promise<void> {
    await this.runCheckpoint();
  }

  /**
   * Trigger a checkpoint (debounced)
   */
  private triggerCheckpoint(): void {
    if (this.state.pending) {
      return;
    }

    this.state = { ...this.state, pending: true };

    // Use debounce from context_hash policy
    const debounceMs = this.policy.context_hash.debounce_ms;

    setTimeout(async () => {
      await this.runCheckpoint();
    }, debounceMs);
  }

  /**
   * Public verify trigger entrypoint (respects priority)
   */
  triggerVerify(priority: "high" | "normal" = "normal"): void {
    if (priority === "high") {
      this.triggerHighPriority();
      return;
    }
    this.triggerCheckpoint();
  }

  /**
   * Trigger a high-priority checkpoint (bypasses debounce)
   * Used for HISTORY_RESTORE to satisfy HISTORY-004 (ASAP verification)
   */
  triggerHighPriority(): void {
    if (this.state.pending) {
      return;
    }
    this.state = { ...this.state, pending: true };
    queueMicrotask(async () => {
      await this.runCheckpoint();
    });
  }

  /**
   * Run the checkpoint
   */
  private async runCheckpoint(): Promise<void> {
    try {
      await this.onCheckpoint();
    } finally {
      this.state = resetAfterCheckpoint(this.state);
      this.scheduleTimer();
    }
  }

  /**
   * Schedule the time-based checkpoint timer
   */
  private scheduleTimer(): void {
    if (this.timer) {
      clearTimeout(this.timer);
    }

    if (!this.policy.checkpoint.enabled) {
      return;
    }

    this.timer = setTimeout(() => {
      if (!this.state.pending) {
        this.triggerCheckpoint();
      }
    }, this.policy.checkpoint.every_ms);
  }

  /**
   * Dispose the scheduler
   */
  dispose(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  /**
   * Get current state
   */
  getState(): CheckpointSchedulerState {
    return { ...this.state };
  }
}
