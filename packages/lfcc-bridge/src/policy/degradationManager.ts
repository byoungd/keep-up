/**
 * LFCC v0.9 RC - Degradation Manager
 * @see docs/product/LFCC_v0.9_RC_Engineering_Docs/13_Chain_Policy_Degradation_Guide.md
 *
 * P0: Manages the complete lifecycle of policy degradation, including:
 * - State persistence
 * - User confirmation tracking
 * - Transactional migration execution
 */

import type { PolicyManifestV09 } from "@keepup/core";
import { updateAnnotationState } from "../annotations/annotationSchema";
import type { LoroRuntime } from "../runtime/loroRuntime";
import {
  type DegradationEvent,
  type DegradationNotification,
  type DegradationState,
  createDegradationContext,
  transitionDegradationState,
} from "./degradationStateMachine";
import type { BridgeAnnotation, DegradationResult } from "./policyManager";

/**
 * Degradation Manager Options
 */
export type DegradationManagerOptions = {
  /** Runtime for persisting state */
  runtime: LoroRuntime;
  /** Origin tag for Loro commits */
  originTag?: string;
  /** Callback when state changes */
  onStateChange?: (state: DegradationState) => void;
  /** Callback for user notifications */
  onNotification?: (notification: DegradationNotification) => void;
};

/**
 * Degradation Manager
 * Manages the complete lifecycle of policy degradation
 */
export class DegradationManager {
  private context: ReturnType<typeof createDegradationContext>;
  private runtime: LoroRuntime;
  private originTag: string;
  private onStateChange?: (state: DegradationState) => void;
  private onNotification?: (notification: DegradationNotification) => void;

  constructor(annotations: BridgeAnnotation[], options: DegradationManagerOptions) {
    this.runtime = options.runtime;
    this.originTag = options.originTag ?? "lfcc:degradation";
    this.onStateChange = options.onStateChange;
    this.onNotification = options.onNotification;

    this.context = createDegradationContext(
      annotations,
      undefined, // documentBlockOrder will be provided when needed
      (state) => {
        this.onStateChange?.(state);
      },
      (notification) => {
        this.onNotification?.(notification);
      }
    );
  }

  /**
   * Get current degradation state
   */
  getState(): DegradationState {
    return this.context.state;
  }

  /**
   * Update annotations list (e.g., when annotations are added/removed)
   */
  updateAnnotations(annotations: BridgeAnnotation[]): void {
    this.context.annotations = annotations;
  }

  /**
   * Update document block order (needed for gap calculation)
   */
  updateDocumentBlockOrder(documentBlockOrder: string[]): void {
    this.context.documentBlockOrder = documentBlockOrder;
  }

  /**
   * Handle policy mismatch detection
   * Transitions from "negotiating" to "validating" state
   */
  handlePolicyMismatch(
    currentManifest: PolicyManifestV09,
    effectiveManifest: PolicyManifestV09,
    documentBlockOrder?: string[]
  ): void {
    if (documentBlockOrder) {
      this.updateDocumentBlockOrder(documentBlockOrder);
    }

    const event: DegradationEvent = {
      type: "POLICY_MISMATCH_DETECTED",
      currentManifest,
      effectiveManifest,
    };

    this.context = transitionDegradationState(this.context, event);
  }

  /**
   * Approve migration
   * Transitions from "validating" to "migrating" state
   */
  approveMigration(): void {
    if (this.context.state.type !== "validating") {
      throw new Error("Cannot approve migration: not in validating state");
    }

    const event: DegradationEvent = { type: "MIGRATION_APPROVED" };
    this.context = transitionDegradationState(this.context, event);

    // Start migration immediately
    this.executeMigration();
  }

  /**
   * Reject migration
   * Transitions from "validating" to "rejected" state
   */
  rejectMigration(): void {
    if (this.context.state.type !== "validating") {
      throw new Error("Cannot reject migration: not in validating state");
    }

    const event: DegradationEvent = { type: "MIGRATION_REJECTED" };
    this.context = transitionDegradationState(this.context, event);
  }

  /**
   * Execute migration transactionally
   * Updates all affected annotations in Loro
   */
  private executeMigration(): void {
    if (this.context.state.type !== "migrating") {
      throw new Error("Cannot execute migration: not in migrating state");
    }

    const { migrationPlan } = this.context.state;

    try {
      // Apply all migration plan items transactionally
      for (const planItem of migrationPlan.migrationPlan) {
        updateAnnotationState(this.runtime.doc, planItem.annotationId, planItem.newState);
      }

      // Commit all changes
      this.runtime.commit(this.originTag);

      // Transition to completed state
      const event: DegradationEvent = { type: "MIGRATION_COMPLETED" };
      this.context = transitionDegradationState(this.context, event);
    } catch (error) {
      // Migration failed - rollback would be handled by Loro's transaction system
      // For now, we just log the error
      console.error("Migration execution failed:", error);
      throw error;
    }
  }

  /**
   * Get migration plan for current state
   */
  getMigrationPlan(): DegradationResult | null {
    const state = this.context.state;
    if (state.type === "validating" || state.type === "migrating" || state.type === "completed") {
      return state.migrationPlan;
    }
    return null;
  }

  /**
   * Check if migration requires user confirmation
   */
  requiresConfirmation(): boolean {
    const state = this.context.state;
    return state.type === "validating" && state.requiresConfirmation;
  }

  /**
   * Check if migration is in progress
   */
  isMigrating(): boolean {
    return this.context.state.type === "migrating";
  }

  /**
   * Check if migration is completed
   */
  isCompleted(): boolean {
    return this.context.state.type === "completed";
  }

  /**
   * Check if migration was rejected
   */
  isRejected(): boolean {
    return this.context.state.type === "rejected";
  }

  /**
   * Reset to negotiating state (for new policy mismatch)
   */
  reset(): void {
    this.context = createDegradationContext(
      this.context.annotations,
      this.context.documentBlockOrder,
      (state) => {
        this.onStateChange?.(state);
      },
      (notification) => {
        this.onNotification?.(notification);
      }
    );
  }
}
