"use client";

import type { LoroRuntime } from "@keepup/lfcc-bridge";
import * as React from "react";

export interface UseLoroBroadcastSyncOptions {
  enabled?: boolean;
}

/**
 * Hook to synchronize Loro document changes across browser tabs
 * using BroadcastChannel API.
 */
export function useLoroBroadcastSync(
  runtime: LoroRuntime | null,
  docId: string,
  options: UseLoroBroadcastSyncOptions = {}
) {
  const { enabled = true } = options;

  const [peerCount, _setPeerCount] = React.useState(0);

  React.useEffect(() => {
    if (!runtime || !enabled) {
      return;
    }

    if (typeof BroadcastChannel === "undefined") {
      console.warn("BroadcastChannel unavailable; sync disabled");
      return;
    }

    let isMounted = true;
    let isSyncing = false;

    const channelId = `lfcc-sync-${docId}`;
    const channel = new BroadcastChannel(channelId);

    // Handle incoming messages from other tabs
    channel.onmessage = (event) => {
      if (!isMounted || !event.data) {
        return;
      }

      try {
        const uint8 = new Uint8Array(event.data);
        isSyncing = true;
        runtime.doc.import(uint8);
      } catch (error) {
        console.error("Sync import failed", error);
      } finally {
        isSyncing = false;
      }
    };

    // Broadcast local changes to other tabs
    const unsubscribe = runtime.doc.subscribe(() => {
      if (isSyncing) {
        return;
      }

      const bytes = runtime.doc.export({ mode: "snapshot" });
      channel.postMessage(bytes);
    });

    return () => {
      isMounted = false;
      unsubscribe?.();
      channel.close();
    };
  }, [runtime, docId, enabled]);

  return { peerCount };
}
