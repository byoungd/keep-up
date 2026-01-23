import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useEffect, useMemo, useRef } from "react";
import { isTauriRuntime } from "../lib/tauriRuntime";

export type FileWatcherEvent = {
  kind: string;
  raw_kind: string;
  paths: string[];
  timestamp_ms: number;
  error?: string;
};

export type FileWatcherBatch = {
  events: FileWatcherEvent[];
};

export type UseFileWatcherOptions = {
  paths: string[];
  recursive?: boolean;
  debounceMs?: number;
  enabled?: boolean;
  onBatch: (events: FileWatcherEvent[]) => void;
};

export function useFileWatcher({
  paths,
  recursive = true,
  debounceMs,
  enabled = true,
  onBatch,
}: UseFileWatcherOptions) {
  const onBatchRef = useRef(onBatch);
  const isAvailable = useMemo(() => isTauriRuntime(), []);

  useEffect(() => {
    onBatchRef.current = onBatch;
  }, [onBatch]);

  useEffect(() => {
    if (!enabled || !isAvailable || paths.length === 0) {
      return undefined;
    }

    const id = crypto.randomUUID();
    const eventName = `file-watch-${id}`;
    const unlistenPromise = listen<FileWatcherBatch>(eventName, (event) => {
      onBatchRef.current(event.payload.events);
    });

    void invoke("watch_paths", {
      id,
      paths,
      recursive,
      debounceMs,
    });

    return () => {
      void unlistenPromise.then((unlisten) => unlisten());
      void invoke("unwatch_paths", { id });
    };
  }, [enabled, isAvailable, paths, recursive, debounceMs]);
}
