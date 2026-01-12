"use client";

import { cn } from "@keepup/shared/utils";
import { AlertTriangle, Clipboard, Eye, RefreshCw, X } from "lucide-react";

export type DivergenceBannerProps = {
  /** Whether divergence is currently detected */
  isVisible: boolean;
  /** Callback to dismiss the banner */
  onDismiss?: () => void;
  /** Callback to trigger recovery/reset (reload page) */
  onRecover?: () => void;
  /** Callback to enter read-only mode */
  onEnterReadOnly?: () => void;
  /** Callback to copy diagnostics */
  onCopyDiagnostics?: () => void;
};

/**
 * Safe, non-panicking banner for divergence detection.
 * Shown when DivergenceDetector triggers a mismatch.
 * UI-only - does not modify CRDT state.
 */
export function DivergenceBanner({
  isVisible,
  onDismiss,
  onRecover,
  onEnterReadOnly,
  onCopyDiagnostics,
}: DivergenceBannerProps) {
  if (!isVisible) {
    return null;
  }

  return (
    <div
      className={cn(
        "fixed bottom-4 left-1/2 -translate-x-1/2 z-50",
        "flex items-start gap-3 px-4 py-3",
        "rounded-lg border border-accent-amber/30",
        "bg-accent-amber/10 dark:bg-accent-amber/15",
        "shadow-lg backdrop-blur-sm",
        "animate-in-fade-slide",
        "max-w-lg"
      )}
      role="alert"
    >
      <AlertTriangle className="h-5 w-5 text-accent-amber shrink-0 mt-0.5" />

      <div className="flex flex-col gap-1 flex-1">
        <span className="text-sm font-medium text-foreground">We detected a sync mismatch</span>
        <span className="text-xs text-muted-foreground">
          Your local edits are preserved. You can reload to sync fresh, continue in read-only mode,
          or export a report for support.
        </span>

        <div className="flex items-center gap-2 mt-2 flex-wrap">
          {onRecover && (
            <button
              type="button"
              onClick={onRecover}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5",
                "text-xs font-medium rounded-md",
                "bg-accent-amber text-white hover:bg-accent-amber/90",
                "transition-colors"
              )}
            >
              <RefreshCw className="h-3 w-3" />
              Reload
            </button>
          )}
          {onEnterReadOnly && (
            <button
              type="button"
              onClick={onEnterReadOnly}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5",
                "text-xs font-medium rounded-md",
                "bg-muted text-muted-foreground hover:bg-muted/80",
                "transition-colors"
              )}
            >
              <Eye className="h-3 w-3" />
              Read-only mode
            </button>
          )}
          {onCopyDiagnostics && (
            <button
              type="button"
              onClick={onCopyDiagnostics}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5",
                "text-xs font-medium rounded-md",
                "bg-muted text-muted-foreground hover:bg-muted/80",
                "transition-colors"
              )}
            >
              <Clipboard className="h-3 w-3" />
              Copy diagnostics
            </button>
          )}
        </div>
      </div>

      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          className="p-1 rounded-md text-accent-amber hover:bg-accent-amber/20 transition-colors shrink-0"
          aria-label="Dismiss"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
