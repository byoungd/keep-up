/**
 * Hooks for interacting with the ImportManager.
 */

import type { ImportJobRow, ImportJobStatus } from "@ku0/db";
import type { ImportManager } from "@ku0/db";
import { useCallback, useEffect, useRef, useState } from "react";
import { getImportManager } from "../lib/db";

/**
 * Hook to access the ImportManager instance.
 */
import type { ProxyImportManager } from "@ku0/db";

export function useImportManager(): ImportManager | ProxyImportManager | null {
  const [manager, setManager] = useState<ImportManager | ProxyImportManager | null>(null);

  useEffect(() => {
    getImportManager().then(setManager);
  }, []);

  return manager;
}

/**
 * Hook to subscribe to import jobs.
 * Uses event-driven updates with throttled progress updates.
 */
export function useImportJobs(filters?: { status?: ImportJobStatus; limit?: number }) {
  const [jobs, setJobs] = useState<ImportJobRow[]>([]);
  const [loading, setLoading] = useState(true);
  const manager = useImportManager();
  const lastProgressUpdateRef = useRef<number>(0);

  // biome-ignore lint/correctness/useExhaustiveDependencies: filters object is unstable
  const updateJobs = useCallback(async () => {
    if (!manager) {
      return;
    }
    const result = await manager.listJobs(filters);
    setJobs(result);
  }, [manager, filters?.status, filters?.limit]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: filters object is unstable
  useEffect(() => {
    if (!manager) {
      return;
    }

    let mounted = true;

    // Initial fetch
    manager.listJobs(filters).then((result) => {
      if (mounted) {
        setJobs(result);
        setLoading(false);
      }
    });

    // Throttled progress update to avoid excessive re-renders
    const handleProgress = () => {
      const now = Date.now();
      // Throttle progress updates to max once per 500ms
      if (now - lastProgressUpdateRef.current > 500) {
        lastProgressUpdateRef.current = now;
        if (mounted) {
          updateJobs();
        }
      }
    };

    // Immediate update for status changes
    const handleStatusChange = () => {
      if (mounted) {
        updateJobs();
      }
    };

    // Subscribe to events (no polling needed - events cover all changes)
    const unsubStatus = manager.on("onJobStatusChange", handleStatusChange);
    const unsubProgress = manager.on("onJobProgress", handleProgress);
    const unsubComplete = manager.on("onJobComplete", handleStatusChange);
    const unsubFail = manager.on("onJobFailed", handleStatusChange);
    const unsubDelete = manager.on("onJobDeleted", handleStatusChange);

    return () => {
      mounted = false;
      unsubStatus();
      unsubProgress();
      unsubComplete();
      unsubFail();
      unsubDelete();
    };
  }, [manager, filters?.status, filters?.limit, updateJobs]);

  return { jobs, loading };
}
