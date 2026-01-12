/**
 * LFCC v0.9 RC - Annotation Types
 * @see docs/product/LFCC_v0.9_RC_Engineering_Docs/01_Kernel_API_Specification.md Section 4
 * @see docs/product/LFCC_v0.9_RC_Engineering_Docs/04_Annotation_State_Machine_and_UX_Spec.md
 */

/** Stored (replicated) annotation states - persisted in CRDT */
export type StoredAnnoState = "active" | "active_partial" | "orphan" | "hidden" | "deleted";

/** Display (UI-only) overlay states - MUST NOT be persisted */
export type DisplayAnnoState =
  | "active"
  | "active_partial"
  | "active_unverified"
  | "broken_grace"
  | "orphan";

/** Grace token for tokenized timers */
export type GraceToken = string;

/** Grace entry for tracking timer validity */
export type GraceEntry = {
  annoId: string;
  token: GraceToken;
  expiresAtMs: number;
};

/** State machine events */
export type AnnoEvent =
  | { type: "FAST_PATH_ENTER" }
  | { type: "CHECKPOINT_OK" }
  | { type: "CHECKPOINT_PARTIAL" }
  | { type: "CHECKPOINT_ORPHAN" }
  | { type: "REPAIR_OK" }
  | { type: "HISTORY_RESTORE" }
  | { type: "GRACE_TIMER_FIRED"; token: GraceToken }
  | { type: "HIDE" }
  | { type: "DELETE" };

/** State machine context */
export type AnnoContext = {
  annoId: string;
  storedState: StoredAnnoState;
  displayState: DisplayAnnoState;
  graceToken: GraceToken | null;
  graceExpiresAtMs: number | null;
};

/** Default grace period in milliseconds */
export const DEFAULT_GRACE_PERIOD_MS = 3000;
