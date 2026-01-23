import { listen } from "@tauri-apps/api/event";
import { useEffect, useMemo, useRef } from "react";
import { isTauriRuntime } from "../lib/tauriRuntime";

export type NativeLogEntry = {
  level: string;
  target: string;
  message?: string;
  fields: Record<string, unknown>;
  timestamp_ms: number;
};

export type NativeLogBatch = {
  entries: NativeLogEntry[];
};

export type UseNativeLogsOptions = {
  enabled?: boolean;
  onBatch: (entries: NativeLogEntry[]) => void;
};

export function useNativeLogs({ enabled = true, onBatch }: UseNativeLogsOptions) {
  const onBatchRef = useRef(onBatch);
  const isAvailable = useMemo(() => isTauriRuntime(), []);

  useEffect(() => {
    onBatchRef.current = onBatch;
  }, [onBatch]);

  useEffect(() => {
    if (!enabled || !isAvailable) {
      return undefined;
    }

    const unlistenPromise = listen<NativeLogBatch>("native-logs", (event) => {
      onBatchRef.current(event.payload.entries);
    });

    return () => {
      void unlistenPromise.then((unlisten) => unlisten());
    };
  }, [enabled, isAvailable]);
}
