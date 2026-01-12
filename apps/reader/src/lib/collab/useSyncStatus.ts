"use client";

import { useEffect, useState } from "react";

export type SyncState = "offline" | "reconnecting" | "synced";

/**
 * UI-only hook for sync status display.
 * This does NOT write to CRDT - purely presentational.
 */
export function useSyncStatus(): SyncState {
  const [state, setState] = useState<SyncState>("synced");

  useEffect(() => {
    const handleOnline = () => setState("synced");
    const handleOffline = () => setState("offline");

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    // Initial state
    if (!navigator.onLine) {
      setState("offline");
    }

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  return state;
}
