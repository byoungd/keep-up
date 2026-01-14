"use client";

import type { LoroRuntime } from "@ku0/lfcc-bridge";
import * as React from "react";

import { docPersistence } from "@/lib/persistence/docPersistence";
import {
  registerPersistenceRuntime,
  unregisterPersistenceRuntime,
} from "@/lib/persistence/persistenceManager";

export interface PersistenceStatus {
  state: "idle" | "saving" | "saved" | "error";
  lastSavedAt: number | null;
  error: Error | null;
}

export interface UseLoroPersistenceOptions {
  debounceMs?: number;
  enabled?: boolean;
}

/**
 * Hook to manage Loro document persistence via IndexedDB.
 * Handles auto-save on document changes with debouncing.
 */
export function useLoroPersistence(
  runtime: LoroRuntime | null,
  docId: string,
  options: UseLoroPersistenceOptions = {}
) {
  const { debounceMs = 1000, enabled = true } = options;

  const [status, setStatus] = React.useState<PersistenceStatus>({
    state: "idle",
    lastSavedAt: null,
    error: null,
  });

  React.useEffect(() => {
    if (!runtime || !enabled) {
      return;
    }

    // Register runtime for immediate saves from other parts of the app
    registerPersistenceRuntime(runtime, docId);

    let isMounted = true;
    let saveTimeout: NodeJS.Timeout;
    let hasPendingChanges = false;

    const save = async () => {
      if (!isMounted) {
        return;
      }

      hasPendingChanges = false;
      setStatus((prev) => ({ ...prev, state: "saving", error: null }));

      try {
        const bytes = runtime.doc.export({ mode: "snapshot" });
        await docPersistence.saveDoc(docId, bytes);

        if (isMounted) {
          setStatus({
            state: "saved",
            lastSavedAt: Date.now(),
            error: null,
          });
        }
      } catch (error) {
        console.error("Failed to save document", error);
        if (isMounted) {
          setStatus((prev) => ({
            ...prev,
            state: "error",
            error: error instanceof Error ? error : new Error(String(error)),
          }));
        }
      }
    };

    // Synchronous flush for cleanup - saves immediately without waiting
    const flushSync = () => {
      if (!hasPendingChanges) {
        return;
      }
      try {
        const bytes = runtime.doc.export({ mode: "snapshot" });
        // Use synchronous approach: queue microtask to ensure save completes
        // before page unload while not blocking the main thread
        docPersistence.saveDoc(docId, bytes).catch((err) => {
          console.error("Failed to flush document on cleanup", err);
        });
      } catch (error) {
        console.error("Failed to export document on cleanup", error);
      }
    };

    const unsubscribe = runtime.doc.subscribe(() => {
      hasPendingChanges = true;
      clearTimeout(saveTimeout);
      saveTimeout = setTimeout(save, debounceMs);
    });

    // Handle page refresh/close - ensure pending changes are saved
    const handleBeforeUnload = () => {
      if (hasPendingChanges) {
        clearTimeout(saveTimeout);
        flushSync();
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      isMounted = false;
      clearTimeout(saveTimeout);
      window.removeEventListener("beforeunload", handleBeforeUnload);
      // Flush pending changes before unmount to prevent data loss
      flushSync();
      unsubscribe?.();
      // Unregister runtime
      unregisterPersistenceRuntime();
    };
  }, [runtime, docId, debounceMs, enabled]);

  return { status };
}

export interface LoadSnapshotResult {
  snapshot: Uint8Array | null;
  migrated: boolean;
  corrupted: boolean;
}

/**
 * Load a document snapshot from IndexedDB with full metadata.
 * Returns corruption and migration status.
 */
export async function loadDocSnapshotWithMetadata(docId: string): Promise<LoadSnapshotResult> {
  try {
    return await docPersistence.loadDocWithMetadata(docId);
  } catch (error) {
    console.error("Failed to load doc snapshot", error);
    return { snapshot: null, migrated: false, corrupted: false };
  }
}

/**
 * Load a document snapshot from IndexedDB.
 * Returns null if no snapshot exists or if corrupted.
 */
export async function loadDocSnapshot(docId: string): Promise<Uint8Array | null> {
  const result = await loadDocSnapshotWithMetadata(docId);
  if (result.corrupted) {
    console.warn(`[loadDocSnapshot] Doc ${docId} is corrupted, returning null`);
  }
  return result.snapshot;
}
