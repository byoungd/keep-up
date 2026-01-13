/**
 * LFCC v0.9 RC - Annotation Display State Machine
 * @see docs/product/LFCC_v0.9_RC_Engineering_Docs/01_Kernel_API_Specification.md Section 4.3
 * @see docs/product/LFCC_v0.9_RC_Engineering_Docs/04_Annotation_State_Machine_and_UX_Spec.md
 */

import { generateGraceToken } from "./tokenizedTimers.js";
import type { AnnoContext, AnnoEvent, GraceToken, StoredAnnoState } from "./types.js";
import { DEFAULT_GRACE_PERIOD_MS } from "./types.js";

/** State machine definition for annotation display */
export type StateMachineConfig = {
  graceMs: number;
};

const DEFAULT_CONFIG: StateMachineConfig = {
  graceMs: DEFAULT_GRACE_PERIOD_MS,
};

/**
 * Create initial context for an annotation
 */
export function createAnnoContext(annoId: string): AnnoContext {
  return {
    annoId,
    storedState: "active",
    displayState: "active_unverified",
    graceToken: null,
    graceExpiresAtMs: null,
  };
}

/**
 * Transition result from state machine
 */
export type TransitionResult = {
  context: AnnoContext;
  actions: AnnoAction[];
};

/** Actions that can be triggered by transitions */
export type AnnoAction =
  | { type: "START_GRACE_TIMER"; token: GraceToken; durationMs: number }
  | { type: "CANCEL_GRACE_TIMER" }
  | { type: "TRIGGER_VERIFY"; priority?: "high" | "normal" }
  | { type: "PERSIST_STATE"; state: StoredAnnoState };

/**
 * Pure state machine transition function
 * f(context, event) -> (newContext, actions)
 */
export function transition(
  ctx: AnnoContext,
  event: AnnoEvent,
  config: StateMachineConfig = DEFAULT_CONFIG
): TransitionResult {
  const actions: AnnoAction[] = [];
  const newCtx = { ...ctx };

  switch (event.type) {
    case "FAST_PATH_ENTER":
      // Fast-path placement - display as unverified until checkpoint
      newCtx.displayState = "active_unverified";
      actions.push({ type: "TRIGGER_VERIFY" });
      break;

    case "CHECKPOINT_OK":
      // Verification succeeded - annotation is fully active
      newCtx.storedState = "active";
      newCtx.displayState = "active";
      if (ctx.graceToken) {
        actions.push({ type: "CANCEL_GRACE_TIMER" });
        newCtx.graceToken = null;
        newCtx.graceExpiresAtMs = null;
      }
      break;

    case "CHECKPOINT_PARTIAL":
      // Partial resolution - some spans resolved
      newCtx.storedState = "active_partial";
      newCtx.displayState = "active_partial";
      if (ctx.graceToken) {
        actions.push({ type: "CANCEL_GRACE_TIMER" });
        newCtx.graceToken = null;
        newCtx.graceExpiresAtMs = null;
      }
      break;

    case "CHECKPOINT_ORPHAN": {
      // Verification failed - enter grace period for display
      newCtx.storedState = "orphan";
      newCtx.displayState = "broken_grace";
      const token = generateGraceToken();
      newCtx.graceToken = token;
      newCtx.graceExpiresAtMs = Date.now() + config.graceMs;
      actions.push({ type: "START_GRACE_TIMER", token, durationMs: config.graceMs });
      actions.push({ type: "PERSIST_STATE", state: "orphan" });
      break;
    }

    case "REPAIR_OK":
      // Annotation was repaired successfully
      newCtx.storedState = "active";
      newCtx.displayState = "active";
      if (ctx.graceToken) {
        actions.push({ type: "CANCEL_GRACE_TIMER" });
        newCtx.graceToken = null;
        newCtx.graceExpiresAtMs = null;
      }
      break;

    case "HISTORY_RESTORE":
      // Undo/redo restored annotation - skip grace, enter unverified
      newCtx.displayState = "active_unverified";
      if (ctx.graceToken) {
        actions.push({ type: "CANCEL_GRACE_TIMER" });
        newCtx.graceToken = null;
        newCtx.graceExpiresAtMs = null;
      }
      actions.push({ type: "TRIGGER_VERIFY", priority: "high" });
      break;

    case "GRACE_TIMER_FIRED":
      // Grace period expired - check token validity
      if (ctx.graceToken === event.token) {
        // Token is current - finalize orphan display
        newCtx.displayState = "orphan";
        newCtx.graceToken = null;
        newCtx.graceExpiresAtMs = null;
      }
      // If token doesn't match, ignore (stale timer)
      break;

    case "HIDE":
      newCtx.storedState = "hidden";
      newCtx.displayState = "orphan"; // Hidden annotations show as orphan in UI
      actions.push({ type: "PERSIST_STATE", state: "hidden" });
      break;

    case "DELETE":
      newCtx.storedState = "deleted";
      newCtx.displayState = "orphan";
      if (ctx.graceToken) {
        actions.push({ type: "CANCEL_GRACE_TIMER" });
        newCtx.graceToken = null;
        newCtx.graceExpiresAtMs = null;
      }
      actions.push({ type: "PERSIST_STATE", state: "deleted" });
      break;
  }

  return { context: newCtx, actions };
}
