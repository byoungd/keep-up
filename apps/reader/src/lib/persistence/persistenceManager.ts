"use client";

import type { LoroRuntime } from "@keepup/lfcc-bridge";

import { docPersistence } from "./docPersistence";

/**
 * Global persistence manager for immediate saves.
 * Used when debounced persistence is not acceptable (e.g., deletions).
 */

type PersistenceState = {
  runtime: LoroRuntime | null;
  docId: string | null;
};

const state: PersistenceState = {
  runtime: null,
  docId: null,
};

/**
 * Register the runtime for persistence.
 * Called by useLoroPersistence when the runtime is available.
 */
export function registerPersistenceRuntime(runtime: LoroRuntime, docId: string): void {
  state.runtime = runtime;
  state.docId = docId;
}

/**
 * Unregister the runtime when component unmounts.
 */
export function unregisterPersistenceRuntime(): void {
  state.runtime = null;
  state.docId = null;
}

/**
 * Immediately save the current document state.
 * Use this for critical operations like deletions that must be persisted.
 * Returns a promise that resolves when the save is complete.
 */
export async function saveImmediately(): Promise<boolean> {
  const { runtime, docId } = state;

  if (!runtime || !docId) {
    return false;
  }

  try {
    const bytes = runtime.doc.export({ mode: "snapshot" });
    await docPersistence.saveDoc(docId, bytes);
    return true;
  } catch (error) {
    console.error("[persistenceManager] Failed to save:", error);
    return false;
  }
}

/**
 * Check if persistence is available.
 */
export function isPersistenceReady(): boolean {
  return state.runtime !== null && state.docId !== null;
}
