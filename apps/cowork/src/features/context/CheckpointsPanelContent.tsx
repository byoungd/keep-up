"use client";

import { Dialog } from "@ku0/shell";
import { useParams } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  type CoworkCheckpointRestoreResult,
  type CoworkCheckpointSummary,
  deleteCheckpoint,
  listCheckpoints,
  restoreCheckpoint,
} from "../../api/coworkApi";

const DEFAULT_LIMIT = 50;

function resolveStatusClass(status: CoworkCheckpointSummary["status"]) {
  if (status === "completed") {
    return "bg-success/10 text-success";
  }
  if (status === "failed") {
    return "bg-error/10 text-error";
  }
  if (status === "cancelled") {
    return "bg-muted/40 text-muted-foreground";
  }
  return "bg-info/10 text-info";
}

export function CheckpointsPanelContent() {
  const { sessionId } = useParams({ strict: false }) as { sessionId?: string };
  const resolvedSessionId = sessionId && sessionId !== "undefined" ? sessionId : null;

  const [checkpoints, setCheckpoints] = useState<CoworkCheckpointSummary[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [lastRestore, setLastRestore] = useState<CoworkCheckpointRestoreResult | null>(null);
  const [pendingRestore, setPendingRestore] = useState<CoworkCheckpointSummary | null>(null);
  const [pendingDelete, setPendingDelete] = useState<CoworkCheckpointSummary | null>(null);

  const canLoad = Boolean(resolvedSessionId);
  const isBusy = isLoading || Boolean(restoringId) || Boolean(deletingId);
  const sortedCheckpoints = useMemo(
    () => [...checkpoints].sort((a, b) => b.createdAt - a.createdAt),
    [checkpoints]
  );
  const latestCheckpoint = sortedCheckpoints[0];

  const loadCheckpoints = useCallback(async () => {
    if (!resolvedSessionId) {
      setCheckpoints([]);
      setErrorMessage("Start a session to view checkpoints.");
      return;
    }
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const data = await listCheckpoints(resolvedSessionId, {
        limit: DEFAULT_LIMIT,
        sortBy: "createdAt",
        sortOrder: "desc",
      });
      setCheckpoints(data);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to load checkpoints.");
    } finally {
      setIsLoading(false);
    }
  }, [resolvedSessionId]);

  useEffect(() => {
    void loadCheckpoints();
  }, [loadCheckpoints]);

  const handleRestore = useCallback(
    async (checkpointId: string) => {
      if (!resolvedSessionId) {
        setErrorMessage("Start a session to restore checkpoints.");
        return;
      }
      setRestoringId(checkpointId);
      setErrorMessage(null);
      setLastRestore(null);
      try {
        const result = await restoreCheckpoint(resolvedSessionId, checkpointId);
        setLastRestore(result);
        await loadCheckpoints();
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : "Failed to restore checkpoint.");
      } finally {
        setRestoringId(null);
      }
    },
    [loadCheckpoints, resolvedSessionId]
  );

  const handleDelete = useCallback(
    async (checkpointId: string) => {
      if (!resolvedSessionId) {
        setErrorMessage("Start a session to delete checkpoints.");
        return;
      }
      setDeletingId(checkpointId);
      setErrorMessage(null);
      try {
        await deleteCheckpoint(resolvedSessionId, checkpointId);
        setCheckpoints((prev) => prev.filter((checkpoint) => checkpoint.id !== checkpointId));
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : "Failed to delete checkpoint.");
      } finally {
        setDeletingId(null);
      }
    },
    [resolvedSessionId]
  );

  const openRestoreDialog = useCallback((checkpoint: CoworkCheckpointSummary) => {
    setPendingRestore(checkpoint);
  }, []);

  const openDeleteDialog = useCallback((checkpoint: CoworkCheckpointSummary) => {
    setPendingDelete(checkpoint);
  }, []);

  const closeRestoreDialog = useCallback(() => {
    setPendingRestore(null);
  }, []);

  const closeDeleteDialog = useCallback(() => {
    setPendingDelete(null);
  }, []);

  const lastRestoreLabel = useMemo(() => {
    if (!lastRestore) {
      return null;
    }
    return `Restored ${lastRestore.checkpointId.slice(0, 8)} at ${new Date(
      lastRestore.restoredAt
    ).toLocaleString()}.`;
  }, [lastRestore]);

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-foreground">Checkpoints</p>
          <p className="text-xs text-muted-foreground">
            Restore or clean up the latest runtime snapshots.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {latestCheckpoint ? (
            <button
              type="button"
              className="px-3 py-2 text-xs font-medium text-primary-foreground bg-primary rounded-md hover:bg-primary/90 transition-colors duration-fast disabled:opacity-60"
              onClick={() => openRestoreDialog(latestCheckpoint)}
              disabled={!canLoad || isBusy}
            >
              Restore latest
            </button>
          ) : null}
          <button
            type="button"
            className="px-3 py-2 text-xs font-medium text-muted-foreground border border-border rounded-md hover:text-foreground hover:bg-surface-2 transition-colors duration-fast disabled:opacity-60"
            onClick={loadCheckpoints}
            disabled={!canLoad || isLoading}
          >
            Refresh
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <div className="h-4 w-4 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
          Loading checkpoints...
        </div>
      ) : null}

      {errorMessage ? <div className="text-xs text-destructive">{errorMessage}</div> : null}

      {lastRestoreLabel ? <div className="text-xs text-success">{lastRestoreLabel}</div> : null}

      {!isLoading && !canLoad ? (
        <div className="text-xs text-muted-foreground">Open a session to manage checkpoints.</div>
      ) : null}

      {!isLoading && canLoad && sortedCheckpoints.length === 0 ? (
        <div className="text-xs text-muted-foreground">No checkpoints yet.</div>
      ) : null}

      <div className="space-y-2">
        {sortedCheckpoints.map((checkpoint, index) => {
          const statusClass = resolveStatusClass(checkpoint.status);
          const isRestoring = restoringId === checkpoint.id;
          const isDeleting = deletingId === checkpoint.id;

          return (
            <div
              key={checkpoint.id}
              className="rounded-md border border-border/60 bg-surface-0 px-3 py-2 space-y-2"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-[11px] text-muted-foreground">
                  {new Date(checkpoint.createdAt).toLocaleString()}
                </span>
                <div className="flex items-center gap-2">
                  {index === 0 ? (
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Latest
                    </span>
                  ) : null}
                  <span
                    className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${statusClass}`}
                  >
                    {checkpoint.status}
                  </span>
                </div>
              </div>
              <div className="text-xs text-foreground line-clamp-2">{checkpoint.task}</div>
              <div className="text-[11px] text-muted-foreground">
                Step {checkpoint.currentStep} / {checkpoint.maxSteps}
                {checkpoint.hasError ? " · error" : ""}
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="px-2 py-1 text-xs font-medium text-primary-foreground bg-primary rounded-md hover:bg-primary/90 transition-colors duration-fast disabled:opacity-60"
                  onClick={() => openRestoreDialog(checkpoint)}
                  disabled={isLoading || isRestoring || isDeleting}
                >
                  {isRestoring ? "Restoring..." : "Restore"}
                </button>
                <button
                  type="button"
                  className="px-2 py-1 text-xs font-medium text-muted-foreground border border-border rounded-md hover:text-foreground hover:bg-surface-2 transition-colors duration-fast disabled:opacity-60"
                  onClick={() => openDeleteDialog(checkpoint)}
                  disabled={isLoading || isDeleting || isRestoring}
                >
                  {isDeleting ? "Deleting..." : "Delete"}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <Dialog
        open={pendingRestore !== null}
        onOpenChange={(open) => {
          if (!open) {
            closeRestoreDialog();
          }
        }}
        title="Restore checkpoint"
        description={
          pendingRestore
            ? `Restore checkpoint "${pendingRestore.task}" from ${new Date(
                pendingRestore.createdAt
              ).toLocaleString()}? This resets the agent state for this session.`
            : "Restore this checkpoint? This resets the agent state for this session."
        }
        className="rounded-2xl bg-surface-1/95 border-border/30"
      >
        <div className="flex justify-end gap-2 mt-6">
          <button
            type="button"
            className="px-3 py-2 text-xs font-medium text-muted-foreground border border-border rounded-md hover:text-foreground hover:bg-surface-2 transition-colors duration-fast disabled:opacity-60"
            onClick={closeRestoreDialog}
          >
            Cancel
          </button>
          <button
            type="button"
            className="px-3 py-2 text-xs font-medium text-primary-foreground bg-primary rounded-md hover:bg-primary/90 transition-colors duration-fast disabled:opacity-60"
            onClick={() => {
              if (pendingRestore) {
                void handleRestore(pendingRestore.id);
              }
              closeRestoreDialog();
            }}
            disabled={isBusy}
          >
            Restore
          </button>
        </div>
      </Dialog>

      <Dialog
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open) {
            closeDeleteDialog();
          }
        }}
        title="Delete checkpoint"
        description={
          pendingDelete
            ? `Delete checkpoint "${pendingDelete.task}"? This action cannot be undone.`
            : "Delete this checkpoint? This action cannot be undone."
        }
        className="rounded-2xl bg-surface-1/95 border-border/30"
      >
        <div className="flex justify-end gap-2 mt-6">
          <button
            type="button"
            className="px-3 py-2 text-xs font-medium text-muted-foreground border border-border rounded-md hover:text-foreground hover:bg-surface-2 transition-colors duration-fast disabled:opacity-60"
            onClick={closeDeleteDialog}
          >
            Cancel
          </button>
          <button
            type="button"
            className="px-3 py-2 text-xs font-medium text-error-foreground bg-error rounded-md hover:bg-error/90 transition-colors duration-fast disabled:opacity-60"
            onClick={() => {
              if (pendingDelete) {
                void handleDelete(pendingDelete.id);
              }
              closeDeleteDialog();
            }}
            disabled={isBusy}
          >
            Delete
          </button>
        </div>
      </Dialog>
    </div>
  );
}
