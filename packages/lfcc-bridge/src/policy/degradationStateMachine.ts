/**
 * LFCC v0.9 RC - Chain Policy Degradation State Machine
 * @see docs/product/LFCC_v0.9_RC_Engineering_Docs/13_Chain_Policy_Degradation_Guide.md
 *
 * P0: Implement degradation state machine (Negotiating -> Degrading -> Validating -> Migrating)
 */

import type { PolicyManifestV09 } from "@keepup/core";
import type { BridgeAnnotation, DegradationResult } from "./policyManager";
import { computeMigrationPlan } from "./policyManager";

export type { BridgeAnnotation };

/**
 * Degradation state machine states
 */
export type DegradationState =
  | { type: "negotiating" }
  | { type: "degrading"; currentManifest: PolicyManifestV09; effectiveManifest: PolicyManifestV09 }
  | {
      type: "validating";
      migrationPlan: DegradationResult;
      requiresConfirmation: boolean;
    }
  | { type: "migrating"; migrationPlan: DegradationResult }
  | { type: "completed"; migrationPlan: DegradationResult }
  | { type: "rejected" };

/**
 * Degradation state machine events
 */
export type DegradationEvent =
  | {
      type: "POLICY_MISMATCH_DETECTED";
      currentManifest: PolicyManifestV09;
      effectiveManifest: PolicyManifestV09;
    }
  | { type: "MIGRATION_APPROVED" }
  | { type: "MIGRATION_REJECTED" }
  | { type: "MIGRATION_COMPLETED" };

/**
 * Degradation state machine context
 */
export type DegradationContext = {
  state: DegradationState;
  annotations: BridgeAnnotation[];
  documentBlockOrder?: string[];
  onStateChange?: (state: DegradationState) => void;
  onNotification?: (notification: DegradationNotification) => void;
};

/**
 * User notification for degradation
 */
export type DegradationNotification = {
  title: string;
  message: string;
  affectedCount: number;
  totalCount: number;
  affectedRatio: number;
  examples: Array<{
    annotationId: string;
    kind: string;
    oldState: string;
    newState: string;
  }>;
  requiresConfirmation: boolean;
  actions: {
    accept: () => void;
    reject: () => void;
    review: () => void;
  };
};

/**
 * Create notification for degradation
 */
function createDegradationNotification(
  migrationPlan: DegradationResult,
  annotations: BridgeAnnotation[],
  requiresConfirmation: boolean,
  context: DegradationContext
): DegradationNotification {
  const affectedCount = migrationPlan.affectedAnnotations.length;
  const totalCount = annotations.length;
  const affectedRatio = totalCount > 0 ? affectedCount / totalCount : 0;

  return {
    title: requiresConfirmation
      ? "Policy Degradation Requires Confirmation"
      : "Policy Degradation Detected",
    message: requiresConfirmation
      ? `${affectedCount} annotations will be affected by policy degradation. Review and confirm to proceed.`
      : `${affectedCount} annotation${affectedCount > 1 ? "s" : ""} will be affected by policy degradation.`,
    affectedCount,
    totalCount,
    affectedRatio,
    examples: migrationPlan.migrationPlan.slice(0, 5).map((plan) => ({
      annotationId: plan.annotationId,
      kind: annotations.find((a) => a.id === plan.annotationId)?.kind ?? "unknown",
      oldState: plan.oldState,
      newState: plan.newState,
    })),
    requiresConfirmation,
    actions: {
      accept: () => {
        const validatingState: DegradationState = {
          type: "validating",
          migrationPlan,
          requiresConfirmation,
        };
        const nextContext = transitionDegradationState(
          { ...context, state: validatingState },
          { type: "MIGRATION_APPROVED" }
        );
        context.onStateChange?.(nextContext.state);
      },
      reject: () => {
        const validatingState: DegradationState = {
          type: "validating",
          migrationPlan,
          requiresConfirmation,
        };
        const nextContext = transitionDegradationState(
          { ...context, state: validatingState },
          { type: "MIGRATION_REJECTED" }
        );
        context.onStateChange?.(nextContext.state);
      },
      review: () => {
        // Show detailed list (UI implementation)
        // Note: In production, this would trigger a UI modal/panel
      },
    },
  };
}

/**
 * Handle negotiating state transition
 */
function handleNegotiatingState(
  context: DegradationContext,
  event: DegradationEvent
): DegradationState | null {
  if (event.type !== "POLICY_MISMATCH_DETECTED") {
    return null;
  }

  const { annotations, documentBlockOrder, onNotification } = context;

  // Generate migration plan
  const migrationPlan = computeMigrationPlan(
    event.currentManifest,
    event.effectiveManifest,
    annotations,
    documentBlockOrder
  );

  const affectedCount = migrationPlan.affectedAnnotations.length;
  const totalCount = annotations.length;
  const affectedRatio = totalCount > 0 ? affectedCount / totalCount : 0;
  const requiresConfirmation = affectedRatio > 0.1 || affectedCount > 50;

  const newState: DegradationState = {
    type: "validating",
    migrationPlan,
    requiresConfirmation,
  };

  // P0: User notification for >10% affected
  if (affectedCount > 0 && onNotification) {
    const notification = createDegradationNotification(
      migrationPlan,
      annotations,
      requiresConfirmation,
      context
    );
    onNotification(notification);
  }

  return newState;
}

/**
 * Transition degradation state machine
 */
export function transitionDegradationState(
  context: DegradationContext,
  event: DegradationEvent
): DegradationContext {
  const { state, onStateChange } = context;

  let newState: DegradationState = state;

  switch (state.type) {
    case "negotiating": {
      const result = handleNegotiatingState(context, event);
      if (result) {
        newState = result;
      }
      break;
    }

    case "validating":
      if (event.type === "MIGRATION_APPROVED") {
        newState = {
          type: "migrating",
          migrationPlan: state.migrationPlan,
        };
      } else if (event.type === "MIGRATION_REJECTED") {
        newState = { type: "rejected" };
      }
      break;

    case "migrating":
      if (event.type === "MIGRATION_COMPLETED") {
        newState = {
          type: "completed",
          migrationPlan: state.migrationPlan,
        };
      }
      break;

    default:
      // No transitions from completed/rejected states
      break;
  }

  onStateChange?.(newState);

  return {
    ...context,
    state: newState,
  };
}

/**
 * Create initial degradation context
 */
export function createDegradationContext(
  annotations: BridgeAnnotation[],
  documentBlockOrder?: string[],
  onStateChange?: (state: DegradationState) => void,
  onNotification?: (notification: DegradationNotification) => void
): DegradationContext {
  return {
    state: { type: "negotiating" },
    annotations,
    documentBlockOrder,
    onStateChange,
    onNotification,
  };
}
