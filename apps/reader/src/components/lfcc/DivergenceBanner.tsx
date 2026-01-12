"use client";

import * as React from "react";

import {
  IssueActionButtons,
  type IssueActionHandlers,
} from "@/components/issues/IssueActionButtons";
import { useToast } from "@/components/ui/Toast";
import { getIssueDefinition } from "@/lib/issues/issues";
import { useLfccDebugStore } from "@/lib/lfcc/debugStore";
import { useDiagnosticsBundle } from "@/lib/lfcc/useDiagnosticsBundle";
import { useReproBundle } from "@/lib/lfcc/useReproBundle";

export type DivergenceInfo = {
  editorChecksum: string;
  loroChecksum: string;
  reason?: string;
  detectedAt: number;
};

interface DivergenceBannerProps {
  info: DivergenceInfo;
  docId: string;
  onReload: () => void;
  onDismiss?: () => void;
  onReadOnly?: () => void;
  isReadOnly?: boolean;
}

export function DivergenceBanner({
  info,
  docId: _docId,
  onReload,
  onDismiss: _onDismiss,
  onReadOnly,
  isReadOnly = false,
}: DivergenceBannerProps) {
  const issue = getIssueDefinition("DIVERGENCE");
  const { copy, isAvailable: diagnosticsAvailable } = useDiagnosticsBundle({});
  const { download, isAvailable: reproAvailable } = useReproBundle();
  const { toast } = useToast();

  const handleCopyDiagnostics = React.useCallback(async () => {
    if (!diagnosticsAvailable) {
      return;
    }
    const ok = await copy();
    if (!ok) {
      toast("Diagnostics copy failed. Check clipboard permissions.", "error");
      return;
    }
    toast("Diagnostics copied.", "success");
  }, [copy, diagnosticsAvailable, toast]);

  const handleExportRepro = React.useCallback(() => {
    if (!reproAvailable) {
      return;
    }
    const ok = download();
    if (!ok) {
      toast("Repro export failed. Try again.", "error");
      return;
    }
    toast("Repro bundle downloaded.", "success");
  }, [download, reproAvailable, toast]);

  const handleReload = React.useCallback(() => {
    onReload();
  }, [onReload]);

  const issueActions = React.useMemo<IssueActionHandlers>(
    () => ({
      onCopyDiagnostics: diagnosticsAvailable ? handleCopyDiagnostics : undefined,
      onExportRepro: reproAvailable ? handleExportRepro : undefined,
      onReload: handleReload,
      onReadOnly: isReadOnly ? undefined : onReadOnly,
    }),
    [
      diagnosticsAvailable,
      handleCopyDiagnostics,
      handleExportRepro,
      handleReload,
      isReadOnly,
      onReadOnly,
      reproAvailable,
    ]
  );

  const timeSinceDetection = React.useMemo(() => {
    const seconds = Math.floor((Date.now() - info.detectedAt) / 1000);
    if (seconds < 60) {
      return `${seconds}s ago`;
    }
    return `${Math.floor(seconds / 60)}m ago`;
  }, [info.detectedAt]);

  return (
    <div
      className="fixed top-4 left-1/2 -translate-x-1/2 z-50 w-full max-w-lg"
      role="alert"
      aria-live="assertive"
    >
      <div className="rounded-lg border border-destructive/30 bg-destructive/10 shadow-lg">
        <div className="p-4">
          {/* Header */}
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-2">
              <svg
                className="h-5 w-5 text-destructive flex-shrink-0"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                role="img"
                aria-labelledby="divergence-warning-icon"
              >
                <title id="divergence-warning-icon">Warning</title>
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                />
              </svg>
              <h3 className="text-sm font-semibold text-destructive">
                Document State Divergence Detected
              </h3>
            </div>
          </div>

          {/* Description */}
          <div className="mt-2 text-sm text-foreground/90">
            <p>{issue.summary}</p>
            <p className="mt-1 text-xs text-muted-foreground">{issue.action}</p>
            {info.reason && (
              <p className="mt-1 text-xs text-muted-foreground">
                Reason: {info.reason} ({timeSinceDetection})
              </p>
            )}
          </div>

          {/* Actions */}
          <IssueActionButtons issue={issue} handlers={issueActions} size="sm" className="mt-4" />

          {/* Read-only notice */}
          {isReadOnly && (
            <div className="mt-3 rounded-md bg-accent-amber/10 border border-accent-amber/30 p-2 text-xs text-foreground/80">
              Editor is in read-only mode. Export repro bundle and reload to resume editing.
            </div>
          )}
        </div>

        {/* Debug info (dev only) */}
        {process.env.NODE_ENV !== "production" && (
          <details className="border-t border-destructive/30 px-4 py-2 text-xs text-destructive">
            <summary className="cursor-pointer hover:text-destructive/80">Debug Info</summary>
            <pre className="mt-2 overflow-x-auto whitespace-pre-wrap">
              {JSON.stringify(
                {
                  editorChecksum: info.editorChecksum,
                  loroChecksum: info.loroChecksum,
                  reason: info.reason,
                  detectedAt: new Date(info.detectedAt).toISOString(),
                },
                null,
                2
              )}
            </pre>
          </details>
        )}
      </div>
    </div>
  );
}

/**
 * Hook to manage divergence state for a document.
 * Returns divergence info and setter for use with BridgeController callbacks.
 */
export function useDivergenceState() {
  const [divergence, setDivergence] = React.useState<DivergenceInfo | null>(null);

  const handleDivergence = React.useCallback(
    (result: {
      diverged: boolean;
      editorChecksum: string;
      loroChecksum: string;
      reason?: string;
    }) => {
      if (result.diverged) {
        const next = {
          editorChecksum: result.editorChecksum,
          loroChecksum: result.loroChecksum,
          reason: result.reason,
          detectedAt: Date.now(),
        };
        setDivergence(next);
        useLfccDebugStore.getState().setDivergence(next);
      }
    },
    []
  );

  const clearDivergence = React.useCallback(() => {
    setDivergence(null);
    useLfccDebugStore.getState().setDivergence(null);
  }, []);

  return {
    divergence,
    handleDivergence,
    clearDivergence,
    isDiverged: divergence !== null,
  };
}
