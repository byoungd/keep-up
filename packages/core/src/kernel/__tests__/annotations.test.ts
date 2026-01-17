/**
 * LFCC v0.9 RC - Annotation State Machine Tests
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createAnnoContext,
  GraceTimerManager,
  isGraceTokenCurrent,
  newGraceEntry,
  transition,
} from "../annotations/index.js";

describe("Annotation State Machine", () => {
  describe("transition", () => {
    it("should start in active_unverified state", () => {
      const ctx = createAnnoContext("anno1");
      expect(ctx.displayState).toBe("active_unverified");
    });

    it("should transition to active on CHECKPOINT_OK", () => {
      const ctx = createAnnoContext("anno1");
      const result = transition(ctx, { type: "CHECKPOINT_OK" });

      expect(result.context.storedState).toBe("active");
      expect(result.context.displayState).toBe("active");
    });

    it("should enter broken_grace on CHECKPOINT_ORPHAN", () => {
      const ctx = createAnnoContext("anno1");
      const result = transition(ctx, { type: "CHECKPOINT_ORPHAN" });

      expect(result.context.storedState).toBe("orphan");
      expect(result.context.displayState).toBe("broken_grace");
      expect(result.context.graceToken).toBeTruthy();
      expect(result.actions).toContainEqual(expect.objectContaining({ type: "START_GRACE_TIMER" }));
    });

    it("should handle GRACE_TIMER_FIRED with matching token", () => {
      let ctx = createAnnoContext("anno1");
      const orphanResult = transition(ctx, { type: "CHECKPOINT_ORPHAN" });
      ctx = orphanResult.context;

      // biome-ignore lint/style/noNonNullAssertion: test context
      const token = ctx.graceToken!;
      const result = transition(ctx, { type: "GRACE_TIMER_FIRED", token });

      expect(result.context.displayState).toBe("orphan");
      expect(result.context.graceToken).toBeNull();
    });

    it("should ignore GRACE_TIMER_FIRED with stale token", () => {
      let ctx = createAnnoContext("anno1");
      const orphanResult = transition(ctx, { type: "CHECKPOINT_ORPHAN" });
      ctx = orphanResult.context;

      // Fire with wrong token
      const result = transition(ctx, { type: "GRACE_TIMER_FIRED", token: "wrong-token" });

      // Should remain in broken_grace
      expect(result.context.displayState).toBe("broken_grace");
      expect(result.context.graceToken).toBeTruthy();
    });

    it("should skip grace on HISTORY_RESTORE", () => {
      let ctx = createAnnoContext("anno1");
      // First make it orphan
      ctx = transition(ctx, { type: "CHECKPOINT_ORPHAN" }).context;

      // Then restore from history
      const result = transition(ctx, { type: "HISTORY_RESTORE" });

      expect(result.context.displayState).toBe("active_unverified");
      expect(result.context.graceToken).toBeNull();
      expect(result.actions).toContainEqual({ type: "CANCEL_GRACE_TIMER" });
      expect(result.actions).toContainEqual({ type: "TRIGGER_VERIFY", priority: "high" });
    });

    it("should handle REPAIR_OK", () => {
      let ctx = createAnnoContext("anno1");
      ctx = transition(ctx, { type: "CHECKPOINT_ORPHAN" }).context;

      const result = transition(ctx, { type: "REPAIR_OK" });

      expect(result.context.storedState).toBe("active");
      expect(result.context.displayState).toBe("active");
    });

    it("should handle CHECKPOINT_PARTIAL", () => {
      const ctx = createAnnoContext("anno1");
      const result = transition(ctx, { type: "CHECKPOINT_PARTIAL" });

      expect(result.context.storedState).toBe("active_partial");
      expect(result.context.displayState).toBe("active_partial");
    });
  });
});

describe("Tokenized Timers", () => {
  describe("newGraceEntry", () => {
    it("should create entry with correct expiration", () => {
      const now = 1000;
      const graceMs = 3000;
      const entry = newGraceEntry("anno1", now, graceMs);

      expect(entry.annoId).toBe("anno1");
      expect(entry.expiresAtMs).toBe(4000);
      expect(entry.token).toBeTruthy();
    });
  });

  describe("isGraceTokenCurrent", () => {
    it("should return true for matching token", () => {
      const entry = newGraceEntry("anno1", Date.now(), 3000);
      expect(isGraceTokenCurrent(entry, { annoId: "anno1", token: entry.token })).toBe(true);
    });

    it("should return false for mismatched token", () => {
      const entry = newGraceEntry("anno1", Date.now(), 3000);
      expect(isGraceTokenCurrent(entry, { annoId: "anno1", token: "wrong" })).toBe(false);
    });

    it("should return false for undefined entry", () => {
      expect(isGraceTokenCurrent(undefined, { annoId: "anno1", token: "any" })).toBe(false);
    });

    it("should return false for mismatched annoId", () => {
      const entry = newGraceEntry("anno1", Date.now(), 3000);
      expect(isGraceTokenCurrent(entry, { annoId: "anno2", token: entry.token })).toBe(false);
    });
  });

  describe("GraceTimerManager", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("should fire callback when grace expires", () => {
      const onExpire = vi.fn();
      const manager = new GraceTimerManager(onExpire);

      const entry = manager.enterGrace("anno1", 1000);
      expect(manager.isInGrace("anno1")).toBe(true);

      vi.advanceTimersByTime(1000);

      expect(onExpire).toHaveBeenCalledWith("anno1", entry.token);
      manager.dispose();
    });

    it("should not fire callback if grace is exited", () => {
      const onExpire = vi.fn();
      const manager = new GraceTimerManager(onExpire);

      manager.enterGrace("anno1", 1000);
      manager.exitGrace("anno1");

      vi.advanceTimersByTime(1000);

      expect(onExpire).not.toHaveBeenCalled();
      expect(manager.isInGrace("anno1")).toBe(false);
      manager.dispose();
    });

    it("should not fire stale timer if re-entered", () => {
      const onExpire = vi.fn();
      const manager = new GraceTimerManager(onExpire);

      manager.enterGrace("anno1", 1000);
      vi.advanceTimersByTime(500);

      // Re-enter grace (new token)
      const newEntry = manager.enterGrace("anno1", 1000);

      vi.advanceTimersByTime(500);
      // First timer would fire here, but token is stale
      expect(onExpire).not.toHaveBeenCalled();

      vi.advanceTimersByTime(500);
      // New timer fires
      expect(onExpire).toHaveBeenCalledWith("anno1", newEntry.token);
      manager.dispose();
    });
  });
});
