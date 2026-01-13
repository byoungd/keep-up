/**
 * LFCC v0.9 RC - Tokenized Timer Implementation
 * @see docs/product/LFCC_v0.9_RC_Engineering_Docs/01_Kernel_API_Specification.md Section 4.2
 * @see docs/product/LFCC_v0.9_RC_Engineering_Docs/04_Annotation_State_Machine_and_UX_Spec.md Section 3
 */

import type { GraceEntry, GraceToken } from "./types.js";
import { DEFAULT_GRACE_PERIOD_MS } from "./types.js";

/**
 * Generate a new grace token (UUID v4)
 */
export function generateGraceToken(): GraceToken {
  // Use crypto.randomUUID if available, otherwise fallback
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback for environments without crypto.randomUUID
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Create a new grace entry for an annotation
 * @param annoId - Annotation ID
 * @param nowMs - Current timestamp in milliseconds
 * @param graceMs - Grace period duration (default 3000ms)
 */
export function newGraceEntry(
  annoId: string,
  nowMs: number,
  graceMs: number = DEFAULT_GRACE_PERIOD_MS
): GraceEntry {
  return {
    annoId,
    token: generateGraceToken(),
    expiresAtMs: nowMs + graceMs,
  };
}

/**
 * Check if a grace token is still current (not stale)
 * This prevents stale timers from incorrectly transitioning state
 *
 * @param current - Current grace entry for the annotation (if any)
 * @param fired - The token that fired from the timer
 * @returns true if the token is current and should be acted upon
 */
export function isGraceTokenCurrent(
  current: GraceEntry | undefined,
  fired: { annoId: string; token: GraceToken }
): boolean {
  if (!current) {
    // No current entry means the grace was cancelled
    return false;
  }

  if (current.annoId !== fired.annoId) {
    // Mismatched annotation ID
    return false;
  }

  if (current.token !== fired.token) {
    // Token was replaced (annotation recovered and re-entered grace, or was cancelled)
    return false;
  }

  return true;
}

/**
 * Check if a grace entry has expired
 */
export function isGraceExpired(entry: GraceEntry, nowMs: number): boolean {
  return nowMs >= entry.expiresAtMs;
}

/**
 * Grace timer manager for tracking multiple annotations
 */
export class GraceTimerManager {
  private entries = new Map<string, GraceEntry>();
  private timers = new Map<string, ReturnType<typeof setTimeout>>();
  private onExpire: (annoId: string, token: GraceToken) => void;

  constructor(onExpire: (annoId: string, token: GraceToken) => void) {
    this.onExpire = onExpire;
  }

  /**
   * Enter broken_grace state for an annotation
   */
  enterGrace(annoId: string, graceMs: number = DEFAULT_GRACE_PERIOD_MS): GraceEntry {
    // Cancel any existing timer
    this.exitGrace(annoId);

    const entry = newGraceEntry(annoId, Date.now(), graceMs);
    this.entries.set(annoId, entry);

    const timer = setTimeout(() => {
      const current = this.entries.get(annoId);
      if (isGraceTokenCurrent(current, { annoId, token: entry.token })) {
        this.onExpire(annoId, entry.token);
      }
    }, graceMs);

    this.timers.set(annoId, timer);
    return entry;
  }

  /**
   * Exit grace state (annotation recovered or was deleted)
   */
  exitGrace(annoId: string): void {
    const timer = this.timers.get(annoId);
    if (timer) {
      clearTimeout(timer);
      this.timers.delete(annoId);
    }
    this.entries.delete(annoId);
  }

  /**
   * Get current grace entry for an annotation
   */
  getEntry(annoId: string): GraceEntry | undefined {
    return this.entries.get(annoId);
  }

  /**
   * Check if annotation is in grace period
   */
  isInGrace(annoId: string): boolean {
    return this.entries.has(annoId);
  }

  /**
   * Clean up all timers
   */
  dispose(): void {
    for (const timer of this.timers.values()) {
      clearTimeout(timer);
    }
    this.timers.clear();
    this.entries.clear();
  }
}
