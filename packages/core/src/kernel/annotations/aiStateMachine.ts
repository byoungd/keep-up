/**
 * LFCC v0.9 RC - AI-Enhanced Annotation State Machine
 * @see docs/product/LFCC_v0.9_RC_Engineering_Docs/04_Annotation_State_Machine_and_UX_Spec.md
 *
 * Extends the base state machine with AI-powered recovery and prediction.
 */

import type {
  AIAnchorRecoveryOptions,
  AIAnchorRecoveryResult,
  AIAnnoContext,
  AIAnnoEvent,
} from "./aiTypes.js";
import { DEFAULT_AI_RECOVERY_OPTIONS } from "./aiTypes.js";
import { generateGraceToken } from "./tokenizedTimers.js";
import type { AnnoEvent, GraceToken } from "./types.js";
import { DEFAULT_GRACE_PERIOD_MS } from "./types.js";

/** Combined event type for AI-enhanced state machine */
export type EnhancedAnnoEvent = AnnoEvent | AIAnnoEvent;

/** Actions that can be triggered by AI-enhanced transitions */
export type AIAnnoAction =
  | { type: "START_GRACE_TIMER"; token: GraceToken; durationMs: number }
  | { type: "CANCEL_GRACE_TIMER" }
  | { type: "TRIGGER_VERIFY"; priority?: "high" | "normal" }
  | { type: "PERSIST_STATE"; state: AIAnnoContext["storedState"] }
  | { type: "AI_START_RECOVERY"; annoId: string; originalContent: string }
  | { type: "AI_SHOW_REPAIR_SUGGESTION"; confidence: number }
  | { type: "AI_APPLY_REPAIR"; newAnchor: { blockId: string; offset: number } }
  | { type: "AI_NOTIFY_CONFLICT"; conflictingAnnoIds: string[] };

/** Transition result from AI-enhanced state machine */
export type AITransitionResult = {
  context: AIAnnoContext;
  actions: AIAnnoAction[];
};

/** Configuration for AI-enhanced state machine */
export type AIStateMachineConfig = {
  graceMs: number;
  aiRecovery: AIAnchorRecoveryOptions;
};

const DEFAULT_AI_CONFIG: AIStateMachineConfig = {
  graceMs: DEFAULT_GRACE_PERIOD_MS,
  aiRecovery: DEFAULT_AI_RECOVERY_OPTIONS,
};

/**
 * Create initial AI-enhanced context for an annotation
 */
export function createAIAnnoContext(annoId: string, originalContent?: string): AIAnnoContext {
  return {
    annoId,
    storedState: "active",
    displayState: "active_unverified",
    graceToken: null,
    graceExpiresAtMs: null,
    ai: originalContent
      ? {
          originalContent,
          contentHash: computeSimpleHash(originalContent),
          repairCount: 0,
        }
      : undefined,
  };
}

/**
 * Simple hash function for content verification
 */
function computeSimpleHash(content: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < content.length; i++) {
    hash ^= content.charCodeAt(i);
    hash = (hash * 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

// ============================================================================
// Event Handlers (extracted for complexity reduction)
// ============================================================================

type TransitionState = {
  ctx: AIAnnoContext;
  newCtx: AIAnnoContext;
  actions: AIAnnoAction[];
  config: AIStateMachineConfig;
};

function handleFastPathEnter(state: TransitionState): void {
  state.newCtx.displayState = "active_unverified";
  state.actions.push({ type: "TRIGGER_VERIFY" });
}

function handleCheckpointOk(state: TransitionState): void {
  state.newCtx.storedState = "active";
  state.newCtx.displayState = "active";
  cancelGraceIfActive(state);
  if (state.newCtx.ai) {
    state.newCtx.ai.lastVerifiedAt = Date.now();
  }
}

function handleCheckpointPartial(state: TransitionState): void {
  state.newCtx.storedState = "active_partial";
  state.newCtx.displayState = "active_partial";
  cancelGraceIfActive(state);
}

function handleCheckpointOrphan(state: TransitionState): void {
  state.newCtx.storedState = "orphan";
  state.newCtx.displayState = "broken_grace";

  const graceDuration = state.config.aiRecovery.extendGraceDuringRecovery
    ? state.config.graceMs * state.config.aiRecovery.graceExtensionMultiplier
    : state.config.graceMs;

  const token = generateGraceToken();
  state.newCtx.graceToken = token;
  state.newCtx.graceExpiresAtMs = Date.now() + graceDuration;

  state.actions.push({ type: "START_GRACE_TIMER", token, durationMs: graceDuration });
  state.actions.push({ type: "PERSIST_STATE", state: "orphan" });

  if (state.newCtx.ai?.originalContent) {
    state.actions.push({
      type: "AI_START_RECOVERY",
      annoId: state.ctx.annoId,
      originalContent: state.newCtx.ai.originalContent,
    });
  }
}

function handleRepairOk(state: TransitionState): void {
  state.newCtx.storedState = "active";
  state.newCtx.displayState = "active";
  cancelGraceIfActive(state);
}

function handleHistoryRestore(state: TransitionState): void {
  state.newCtx.displayState = "active_unverified";
  cancelGraceIfActive(state);
  state.actions.push({ type: "TRIGGER_VERIFY", priority: "high" });
}

function handleGraceTimerFired(state: TransitionState, event: { token: GraceToken }): void {
  if (state.ctx.graceToken !== event.token) {
    return;
  }

  if (state.newCtx.ai?.pendingRepair) {
    const newToken = generateGraceToken();
    state.newCtx.graceToken = newToken;
    state.newCtx.graceExpiresAtMs = Date.now() + state.config.graceMs;
    state.actions.push({
      type: "START_GRACE_TIMER",
      token: newToken,
      durationMs: state.config.graceMs,
    });
  } else {
    state.newCtx.displayState = "orphan";
    state.newCtx.graceToken = null;
    state.newCtx.graceExpiresAtMs = null;
  }
}

function handleHide(state: TransitionState): void {
  state.newCtx.storedState = "hidden";
  state.newCtx.displayState = "orphan";
  state.actions.push({ type: "PERSIST_STATE", state: "hidden" });
}

function handleDelete(state: TransitionState): void {
  state.newCtx.storedState = "deleted";
  state.newCtx.displayState = "orphan";
  cancelGraceIfActive(state);
  state.actions.push({ type: "PERSIST_STATE", state: "deleted" });
}

function handleAIPredictOrphan(state: TransitionState, event: { confidence: number }): void {
  if (event.confidence < state.config.aiRecovery.minConfidence) {
    return;
  }

  state.newCtx.displayState = "broken_grace";
  const token = generateGraceToken();
  const extendedGrace = state.config.graceMs * state.config.aiRecovery.graceExtensionMultiplier;
  state.newCtx.graceToken = token;
  state.newCtx.graceExpiresAtMs = Date.now() + extendedGrace;
  state.actions.push({ type: "START_GRACE_TIMER", token, durationMs: extendedGrace });

  if (state.newCtx.ai?.originalContent) {
    state.actions.push({
      type: "AI_START_RECOVERY",
      annoId: state.ctx.annoId,
      originalContent: state.newCtx.ai.originalContent,
    });
  }
}

function handleAISuggestRepair(
  state: TransitionState,
  event: { newAnchor: { blockId: string; offset: number }; confidence: number }
): void {
  if (!state.newCtx.ai) {
    state.newCtx.ai = {};
  }
  state.newCtx.ai.pendingRepair = {
    newAnchor: event.newAnchor,
    confidence: event.confidence,
    suggestedAt: Date.now(),
  };

  if (event.confidence >= state.config.aiRecovery.autoRepairThreshold) {
    state.actions.push({ type: "AI_APPLY_REPAIR", newAnchor: event.newAnchor });
    state.newCtx.ai.pendingRepair = undefined;
    state.newCtx.ai.repairCount = (state.newCtx.ai.repairCount ?? 0) + 1;
  } else {
    state.actions.push({ type: "AI_SHOW_REPAIR_SUGGESTION", confidence: event.confidence });
  }
}

function handleAIRepairApproved(state: TransitionState): void {
  if (state.newCtx.ai?.pendingRepair) {
    state.actions.push({
      type: "AI_APPLY_REPAIR",
      newAnchor: state.newCtx.ai.pendingRepair.newAnchor,
    });
    state.newCtx.ai.repairCount = (state.newCtx.ai.repairCount ?? 0) + 1;
    state.newCtx.ai.pendingRepair = undefined;
  }
}

function handleAIRepairRejected(state: TransitionState): void {
  if (state.newCtx.ai) {
    state.newCtx.ai.pendingRepair = undefined;
  }
  state.newCtx.displayState = "orphan";
  cancelGraceIfActive(state);
}

function handleAIConflictDetected(
  state: TransitionState,
  event: { conflictingAnnoIds: string[] }
): void {
  state.actions.push({ type: "AI_NOTIFY_CONFLICT", conflictingAnnoIds: event.conflictingAnnoIds });
}

function cancelGraceIfActive(state: TransitionState): void {
  if (state.ctx.graceToken) {
    state.actions.push({ type: "CANCEL_GRACE_TIMER" });
    state.newCtx.graceToken = null;
    state.newCtx.graceExpiresAtMs = null;
  }
}

// ============================================================================
// Main Transition Function
// ============================================================================

/**
 * AI-enhanced state machine transition function.
 * Handles both standard and AI-specific events.
 *
 * f(context, event) -> (newContext, actions)
 */
export function aiTransition(
  ctx: AIAnnoContext,
  event: EnhancedAnnoEvent,
  config: AIStateMachineConfig = DEFAULT_AI_CONFIG
): AITransitionResult {
  const actions: AIAnnoAction[] = [];
  const newCtx: AIAnnoContext = {
    ...ctx,
    ai: ctx.ai ? { ...ctx.ai } : undefined,
  };

  const state: TransitionState = { ctx, newCtx, actions, config };

  switch (event.type) {
    case "FAST_PATH_ENTER":
      handleFastPathEnter(state);
      break;
    case "CHECKPOINT_OK":
      handleCheckpointOk(state);
      break;
    case "CHECKPOINT_PARTIAL":
      handleCheckpointPartial(state);
      break;
    case "CHECKPOINT_ORPHAN":
      handleCheckpointOrphan(state);
      break;
    case "REPAIR_OK":
      handleRepairOk(state);
      break;
    case "HISTORY_RESTORE":
      handleHistoryRestore(state);
      break;
    case "GRACE_TIMER_FIRED":
      handleGraceTimerFired(state, event);
      break;
    case "HIDE":
      handleHide(state);
      break;
    case "DELETE":
      handleDelete(state);
      break;
    case "AI_PREDICT_ORPHAN":
      handleAIPredictOrphan(state, event);
      break;
    case "AI_SUGGEST_REPAIR":
      handleAISuggestRepair(state, event);
      break;
    case "AI_REPAIR_APPROVED":
      handleAIRepairApproved(state);
      break;
    case "AI_REPAIR_REJECTED":
      handleAIRepairRejected(state);
      break;
    case "AI_CONFLICT_DETECTED":
      handleAIConflictDetected(state, event);
      break;
  }

  return { context: newCtx, actions };
}

/**
 * Process an AI anchor recovery result and generate appropriate events.
 */
export function processAIRecoveryResult(
  result: AIAnchorRecoveryResult,
  _config: AIAnchorRecoveryOptions = DEFAULT_AI_RECOVERY_OPTIONS
): AIAnnoEvent | null {
  if (!result.success || !result.newAnchor) {
    return null;
  }

  return {
    type: "AI_SUGGEST_REPAIR",
    newAnchor: result.newAnchor,
    confidence: result.confidence,
  };
}
