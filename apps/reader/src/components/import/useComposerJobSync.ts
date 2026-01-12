/**
 * Hook to sync Composer state with import job updates
 */

import { useEffect } from "react";
import { useImportJobs } from "../../hooks/useImportManager";
import type { AddSourceItem, ComposerAction } from "./types";

interface UseComposerJobSyncProps {
  items: AddSourceItem[];
  dispatch: React.Dispatch<ComposerAction>;
}

type JobStatus =
  | "queued"
  | "ingesting"
  | "normalizing"
  | "storing"
  | "done"
  | "failed"
  | "canceled";

/** Map job status to item status */
function mapJobStatusToItemStatus(jobStatus: JobStatus): AddSourceItem["status"] | null {
  switch (jobStatus) {
    case "queued":
      return "queued";
    case "ingesting":
    case "normalizing":
    case "storing":
      return "processing";
    case "done":
      return "ready";
    case "failed":
      return "failed";
    case "canceled":
      return "canceled";
    default:
      return null;
  }
}

/** Process a single item update */
function processItemUpdate(
  item: AddSourceItem,
  job: { status: JobStatus; errorCode?: string; errorMessage?: string; resultDocumentId?: string },
  dispatch: React.Dispatch<ComposerAction>
): void {
  const newStatus = mapJobStatusToItemStatus(job.status);
  if (!newStatus || item.status === newStatus) {
    return;
  }

  dispatch({
    type: "UPDATE_ITEM_STATUS",
    localId: item.localId,
    status: newStatus,
    errorCode: job.errorCode ?? undefined,
    errorMessage: job.errorMessage ?? undefined,
  });

  // Set result document ID when job completes
  if (newStatus === "ready" && job.resultDocumentId) {
    dispatch({
      type: "SET_ITEM_RESULT",
      localId: item.localId,
      resultDocumentId: job.resultDocumentId,
    });
  }
}

/**
 * Syncs Composer source items with import job status updates
 */
export function useComposerJobSync({ items, dispatch }: UseComposerJobSyncProps) {
  const { jobs } = useImportJobs();

  useEffect(() => {
    for (const item of items) {
      if (!item.jobId) {
        continue;
      }

      const job = jobs.find((j) => j.jobId === item.jobId);
      if (job) {
        processItemUpdate(
          item,
          job as {
            status: JobStatus;
            errorCode?: string;
            errorMessage?: string;
            resultDocumentId?: string;
          },
          dispatch
        );
      }
    }
  }, [jobs, items, dispatch]);
}
