/**
 * Leader Election Module
 *
 * Uses the Web Locks API to elect a single "leader" tab that handles
 * background jobs (RSS polling, outbox processing, etc.).
 *
 * Non-leader tabs can still read/write to the DB, but should not run
 * background jobs to avoid duplicate work.
 */

import { observability } from "@ku0/core";

/** Lock name used for leader election */
const LEADER_LOCK_NAME = "reader-db-leader";
const logger = observability.getLogger();

/** Result of leader election */
export interface LeaderElectionResult {
  /** Whether this tab is the leader */
  isLeader: boolean;
  /** Release leadership (for cleanup) */
  release: () => void;
}

/** Callback when leader status changes */
export type LeaderChangeCallback = (isLeader: boolean) => void;

/**
 * Check if Web Locks API is available.
 */
export function isWebLocksAvailable(): boolean {
  return (
    typeof navigator !== "undefined" &&
    "locks" in navigator &&
    typeof navigator.locks?.request === "function"
  );
}

/**
 * Attempt to acquire leadership without blocking.
 *
 * Uses `ifAvailable: true` so we get the lock immediately if available,
 * or get `null` if another tab holds it.
 *
 * @param onChange - Optional callback when leadership status changes
 * @returns Promise resolving to election result
 */
export async function acquireLeadership(
  onChange?: LeaderChangeCallback
): Promise<LeaderElectionResult> {
  if (!isWebLocksAvailable()) {
    // Fallback: if locks unavailable, assume single-tab and become leader
    logger.warn("persistence", "Web Locks API not available, assuming leader");
    return {
      isLeader: true,
      release: () => {
        // No-op because there is no shared lock to release in single-tab mode.
      },
    };
  }

  let isLeader = false;
  let releaseResolve: (() => void) | null = null;

  // Create a promise that we can resolve to release the lock
  const releasePromise = new Promise<void>((resolve) => {
    releaseResolve = resolve;
  });

  try {
    // Try to acquire the lock without blocking
    const lockAcquired = await navigator.locks.request(
      LEADER_LOCK_NAME,
      { ifAvailable: true },
      async (lock) => {
        if (lock) {
          // We got the lock - we are the leader
          isLeader = true;
          onChange?.(true);

          // Hold the lock until releasePromise resolves
          await releasePromise;

          // Lock will be released when this callback returns
          onChange?.(false);
          return true;
        }
        // Lock was held by another tab
        return false;
      }
    );

    if (!lockAcquired) {
      // We didn't get the lock - we are a follower
      isLeader = false;
      onChange?.(false);

      // Set up a listener to try acquiring leadership when it becomes available
      startLeadershipWatch(onChange);
    }
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    logger.error("persistence", "Failed to acquire lock", error);
    // On error, assume single-tab scenario
    isLeader = true;
    onChange?.(true); // Notify callback of leader status
  }

  return {
    isLeader,
    release: () => {
      releaseResolve?.();
    },
  };
}

/**
 * Watch for leadership to become available.
 * When the current leader releases the lock, try to acquire it.
 */
function startLeadershipWatch(onChange?: LeaderChangeCallback): void {
  if (!isWebLocksAvailable()) {
    return;
  }

  // Request the lock in blocking mode - this will wait until available
  navigator.locks
    .request(LEADER_LOCK_NAME, async () => {
      // We became the leader
      onChange?.(true);

      // Hold leadership indefinitely until tab closes
      await new Promise<void>(() => {
        // Never resolves - hold lock until tab closes
      });
    })
    .catch((err) => {
      const error = err instanceof Error ? err : new Error(String(err));
      logger.error("persistence", "Leadership watch failed", error);
    });
}

/**
 * Get current leader status from Web Locks query API.
 */
export async function getLeadershipStatus(): Promise<{
  isLeader: boolean;
  leaderHeld: boolean;
}> {
  if (!isWebLocksAvailable()) {
    return { isLeader: true, leaderHeld: false };
  }

  try {
    const state = await navigator.locks.query();
    const held = state.held?.some((lock) => lock.name === LEADER_LOCK_NAME) ?? false;
    const pending = state.pending?.some((lock) => lock.name === LEADER_LOCK_NAME) ?? false;

    // We are leader if we hold the lock (clientId matches)
    // For now, just report if leadership is held by anyone
    return {
      isLeader: false, // Will be updated by acquireLeadership
      leaderHeld: held || pending,
    };
  } catch {
    return { isLeader: true, leaderHeld: false };
  }
}
