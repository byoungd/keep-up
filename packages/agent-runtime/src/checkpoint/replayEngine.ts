/**
 * Replay Engine
 *
 * Implements replay and idempotency per spec Section 5.9.
 *
 * Requirements:
 * 1. Tool calls MUST have stable IDs for replay and deduplication
 * 2. Tool inputs and outputs MUST be recorded in checkpoints
 * 3. Side-effectful tools MUST not be re-executed during replay without explicit approval
 */

import type { Checkpoint, CheckpointToolResult } from "./checkpointManager";
import type { EventLogManager } from "./eventLog";
import { createToolCallEndEvent, createTurnStartEvent } from "./eventLog";

// ============================================================================
// Types
// ============================================================================

/**
 * Side-effectful tools that require approval during replay.
 */
export const SIDE_EFFECTFUL_TOOLS = new Set([
  "file_write",
  "run_command",
  "bash",
  "shell",
  "write_file",
  "delete_file",
  "move_file",
  "create_directory",
  "http_request",
  "send_email",
  "deploy",
]);

/**
 * Configuration for replay engine.
 */
export interface ReplayEngineConfig {
  /** Event log manager for recording replay events */
  eventLog?: EventLogManager;
  /** Custom list of side-effectful tools */
  sideEffectfulTools?: string[];
  /** Handler for approval requests */
  approvalHandler?: ReplayApprovalHandler;
}

/**
 * Handler for requesting approval of side-effectful tools during replay.
 */
export type ReplayApprovalHandler = (request: ReplayApprovalRequest) => Promise<boolean>;

/**
 * Request for approval of a side-effectful tool during replay.
 */
export interface ReplayApprovalRequest {
  /** Tool name */
  toolName: string;
  /** Tool arguments */
  arguments: Record<string, unknown>;
  /** Previous result from the original run */
  previousResult?: unknown;
  /** Reason for replay */
  reason: string;
}

/**
 * Plan for replaying from a checkpoint.
 */
export interface ReplayPlan {
  /** Checkpoint to replay from */
  checkpoint: Checkpoint;
  /** Tool call IDs that have already been executed (skip these) */
  completedToolCallIds: Set<string>;
  /** Tool call IDs that are pending (execute these) */
  pendingToolCallIds: Set<string>;
  /** List of side-effectful tools that would be replayed */
  sideEffectfulToolsPending: string[];
  /** Step to resume from */
  resumeFromStep: number;
  /** Number of steps already completed */
  completedSteps: number;
}

/**
 * Options for executing replay.
 */
export interface ReplayOptions {
  /** Skip side-effectful tools entirely (use cached result) */
  skipSideEffectfulTools?: boolean;
  /** Always request approval for side-effectful tools */
  requireApproval?: boolean;
  /** Maximum retries for failed tool calls */
  maxRetries?: number;
}

/**
 * Event emitted during replay.
 */
export interface ReplayEvent {
  type:
    | "tool_skipped"
    | "tool_replayed"
    | "approval_requested"
    | "approval_granted"
    | "approval_denied"
    | "error";
  toolCallId?: string;
  toolName?: string;
  reason?: string;
  result?: unknown;
}

/**
 * Result of preparing a replay.
 */
export interface ReplayPreparationResult {
  success: boolean;
  plan?: ReplayPlan;
  error?: string;
}

// ============================================================================
// Stable Tool ID Generation
// ============================================================================

/**
 * Generate a stable tool call ID for idempotency.
 *
 * Per spec 5.9: Tool calls MUST have stable IDs for replay and deduplication.
 *
 * The ID is deterministic based on:
 * - Tool name
 * - Serialized arguments
 * - Turn number (to handle multiple calls to same tool with same args)
 */
export function generateStableToolCallId(
  toolName: string,
  args: Record<string, unknown>,
  turn: number,
  index: number = 0
): string {
  const argsHash = hashObject(args);
  return `tool_${toolName}_${turn}_${index}_${argsHash}`;
}

/**
 * Simple deterministic hash for an object.
 */
function hashObject(obj: Record<string, unknown>): string {
  const str = JSON.stringify(obj, Object.keys(obj).sort());
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash).toString(36);
}

// ============================================================================
// Replay Engine
// ============================================================================

export class ReplayEngine {
  private readonly eventLog?: EventLogManager;
  private readonly sideEffectfulTools: Set<string>;
  private readonly approvalHandler?: ReplayApprovalHandler;

  constructor(config: ReplayEngineConfig = {}) {
    this.eventLog = config.eventLog;
    this.sideEffectfulTools = new Set(config.sideEffectfulTools ?? SIDE_EFFECTFUL_TOOLS);
    this.approvalHandler = config.approvalHandler;
  }

  /**
   * Prepare a replay plan from a checkpoint.
   */
  prepareReplay(checkpoint: Checkpoint): ReplayPreparationResult {
    // Validate checkpoint is replayable
    if (checkpoint.status === "completed") {
      return {
        success: false,
        error: "Cannot replay from a completed checkpoint",
      };
    }

    if (checkpoint.status === "cancelled") {
      return {
        success: false,
        error: "Cannot replay from a cancelled checkpoint",
      };
    }

    // Build sets of completed and pending tool calls
    const completedToolCallIds = new Set<string>();
    const pendingToolCallIds = new Set<string>();
    const sideEffectfulToolsPending: string[] = [];

    // Track completed tool calls
    for (const result of checkpoint.completedToolCalls) {
      completedToolCallIds.add(result.callId);
    }

    // Track pending tool calls
    for (const call of checkpoint.pendingToolCalls) {
      pendingToolCallIds.add(call.id);
      if (this.sideEffectfulTools.has(call.name)) {
        sideEffectfulToolsPending.push(call.name);
      }
    }

    return {
      success: true,
      plan: {
        checkpoint,
        completedToolCallIds,
        pendingToolCallIds,
        sideEffectfulToolsPending,
        resumeFromStep: checkpoint.currentStep,
        completedSteps: checkpoint.completedToolCalls.length,
      },
    };
  }

  /**
   * Check if a tool call should be skipped during replay.
   */
  shouldSkipToolCall(
    toolCallId: string,
    plan: ReplayPlan
  ): { skip: boolean; cachedResult?: CheckpointToolResult } {
    if (plan.completedToolCallIds.has(toolCallId)) {
      // Find the cached result
      const cachedResult = plan.checkpoint.completedToolCalls.find((r) => r.callId === toolCallId);
      return { skip: true, cachedResult };
    }
    return { skip: false };
  }

  /**
   * Check if a tool requires approval during replay.
   */
  requiresApproval(toolName: string, options: ReplayOptions = {}): boolean {
    if (options.requireApproval) {
      return true;
    }
    return this.sideEffectfulTools.has(toolName);
  }

  /**
   * Request approval for a side-effectful tool during replay.
   */
  async requestApproval(
    toolName: string,
    args: Record<string, unknown>,
    previousResult?: unknown
  ): Promise<boolean> {
    if (!this.approvalHandler) {
      // No handler = auto-deny for safety
      return false;
    }

    return this.approvalHandler({
      toolName,
      arguments: args,
      previousResult,
      reason: "Side-effectful tool requires approval during replay",
    });
  }

  /**
   * Execute a replay with idempotency checks.
   */
  async *executeReplay(
    plan: ReplayPlan,
    options: ReplayOptions = {},
    toolExecutor: (
      toolName: string,
      args: Record<string, unknown>
    ) => Promise<{ success: boolean; result: unknown }>
  ): AsyncGenerator<ReplayEvent> {
    const runId = plan.checkpoint.agentId;
    const agentId = plan.checkpoint.agentId;

    // Emit turn start event
    await this.logTurnStart(runId, agentId, plan);

    // Process pending tool calls
    for (const pendingCall of plan.checkpoint.pendingToolCalls) {
      yield* this.processToolCall(pendingCall, plan, options, toolExecutor, runId, agentId);
    }
  }

  /**
   * Log turn start event if event log is available.
   */
  private async logTurnStart(runId: string, agentId: string, plan: ReplayPlan): Promise<void> {
    if (this.eventLog) {
      await this.eventLog.append(
        createTurnStartEvent(runId, agentId, plan.resumeFromStep, {
          replay: true,
          checkpointId: plan.checkpoint.id,
        })
      );
    }
  }

  /**
   * Process a single tool call during replay.
   */
  private async *processToolCall(
    pendingCall: { id: string; name: string; arguments: Record<string, unknown> },
    plan: ReplayPlan,
    options: ReplayOptions,
    toolExecutor: (
      name: string,
      args: Record<string, unknown>
    ) => Promise<{ success: boolean; result: unknown }>,
    runId: string,
    agentId: string
  ): AsyncGenerator<ReplayEvent> {
    const { id: toolCallId, name: toolName, arguments: args } = pendingCall;

    // Check idempotency - skip if already completed
    const { skip, cachedResult } = this.shouldSkipToolCall(toolCallId, plan);
    if (skip) {
      yield this.createSkipEvent(
        toolCallId,
        toolName,
        "Already completed in original run",
        cachedResult?.result
      );
      return;
    }

    // Handle side-effectful tools
    const sideEffectResult = yield* this.handleSideEffectfulTool(
      toolCallId,
      toolName,
      args,
      options
    );
    if (sideEffectResult === "skip") {
      return;
    }

    // Execute the tool
    yield* this.executeToolCall(
      toolCallId,
      toolName,
      args,
      toolExecutor,
      runId,
      agentId,
      plan.resumeFromStep
    );
  }

  /**
   * Handle side-effectful tool approval flow.
   * Returns "skip" if the tool should be skipped, undefined otherwise.
   */
  private async *handleSideEffectfulTool(
    toolCallId: string,
    toolName: string,
    args: Record<string, unknown>,
    options: ReplayOptions
  ): AsyncGenerator<ReplayEvent, "skip" | undefined> {
    if (!this.sideEffectfulTools.has(toolName)) {
      return undefined;
    }

    if (options.skipSideEffectfulTools) {
      yield this.createSkipEvent(toolCallId, toolName, "Side-effectful tool skipped per options");
      return "skip";
    }

    // Request approval
    yield { type: "approval_requested", toolCallId, toolName };

    const approved = await this.requestApproval(toolName, args);
    if (!approved) {
      yield {
        type: "approval_denied",
        toolCallId,
        toolName,
        reason: "User denied approval for side-effectful tool",
      };
      return "skip";
    }

    yield { type: "approval_granted", toolCallId, toolName };
    return undefined;
  }

  /**
   * Execute a tool call and log the result.
   */
  private async *executeToolCall(
    toolCallId: string,
    toolName: string,
    args: Record<string, unknown>,
    toolExecutor: (
      name: string,
      args: Record<string, unknown>
    ) => Promise<{ success: boolean; result: unknown }>,
    runId: string,
    agentId: string,
    step: number
  ): AsyncGenerator<ReplayEvent> {
    const startTime = Date.now();
    try {
      const { success, result } = await toolExecutor(toolName, args);
      const durationMs = Date.now() - startTime;

      // Log the tool call end event
      if (this.eventLog) {
        await this.eventLog.append(
          createToolCallEndEvent(
            runId,
            agentId,
            step,
            toolCallId,
            toolName,
            success,
            durationMs,
            result
          )
        );
      }

      yield { type: "tool_replayed", toolCallId, toolName, result };
    } catch (error) {
      yield {
        type: "error",
        toolCallId,
        toolName,
        reason: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Create a skip event.
   */
  private createSkipEvent(
    toolCallId: string,
    toolName: string,
    reason: string,
    result?: unknown
  ): ReplayEvent {
    return { type: "tool_skipped", toolCallId, toolName, reason, result };
  }

  /**
   * Validate that a tool call ID is stable (deterministic).
   */
  validateStableId(
    toolCallId: string,
    toolName: string,
    args: Record<string, unknown>,
    turn: number,
    index: number
  ): boolean {
    const expectedId = generateStableToolCallId(toolName, args, turn, index);
    return toolCallId === expectedId;
  }
}

// ============================================================================
// Factory
// ============================================================================

/**
 * Create a replay engine.
 */
export function createReplayEngine(config: ReplayEngineConfig = {}): ReplayEngine {
  return new ReplayEngine(config);
}
