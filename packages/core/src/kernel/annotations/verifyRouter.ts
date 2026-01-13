/**
 * LFCC v0.9 RC - Verification Router
 * Maps TRIGGER_VERIFY actions to CheckpointScheduler priority.
 */

import type { CheckpointScheduler } from "../integrity/checkpoint.js";
import type { AnnoAction } from "./stateMachine.js";

/**
 * Route TRIGGER_VERIFY actions to the checkpoint scheduler.
 * Non-verify actions are returned for further handling.
 */
export function routeVerifyAction(
  action: AnnoAction,
  scheduler: CheckpointScheduler
): AnnoAction | null {
  if (action.type === "TRIGGER_VERIFY") {
    scheduler.triggerVerify(action.priority ?? "normal");
    return null; // handled
  }
  return action;
}
