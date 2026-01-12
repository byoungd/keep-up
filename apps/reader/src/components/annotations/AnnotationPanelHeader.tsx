"use client";

import { CollabStatus } from "@/components/lfcc/CollabStatus";
import { ParticipantList } from "@/components/lfcc/ParticipantList";
import { Button } from "@/components/ui/Button";
import { Tooltip } from "@/components/ui/Tooltip";
import type { DiagnosticsSyncSummary } from "@/lib/lfcc/diagnosticsBundle";
import { usePresenceSummary } from "@/lib/lfcc/presenceStore";
import { Share2 } from "lucide-react";

export interface AnnotationPanelHeaderProps {
  count: number;
  onCopyDiagnostics?: () => void;
  onShare?: () => void;
  copyDisabled?: boolean;
  shareDisabled?: boolean;
  syncSummary?: DiagnosticsSyncSummary;
  showDiagnosticsToggle?: boolean;
  includeContent?: boolean;
  onIncludeContentChange?: (next: boolean) => void;
}

export function AnnotationPanelHeader({
  count,
  onShare,
  shareDisabled = false,
  syncSummary,
  showDiagnosticsToggle = false,
  includeContent = false,
  onIncludeContentChange,
}: AnnotationPanelHeaderProps) {
  const showPresence = syncSummary !== undefined;
  const { peers: storePeers } = usePresenceSummary();
  const presencePeers = syncSummary?.peers ?? storePeers;

  return (
    <div className="px-4 py-4 sm:px-5">
      {/* Presence row - only shown in collab mode */}
      {showPresence && (
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4 pb-4 border-b border-border/30">
          <CollabStatus
            state={syncSummary?.state ?? "disconnected"}
            error={syncSummary?.error}
            pendingUpdates={syncSummary?.pendingUpdates}
            lastSyncAt={syncSummary?.lastSyncAt}
            clientId={syncSummary?.clientId ?? undefined}
            docId={syncSummary?.docId}
            className="min-w-0"
          />
          <ParticipantList peers={presencePeers} />
        </div>
      )}

      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Annotations</h2>
          <p className="mt-1 text-[11px] text-foreground/70">
            <span className="tabular-nums">{count}</span> highlight{count === 1 ? "" : "s"}
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          {showDiagnosticsToggle && onIncludeContentChange && (
            <label className="flex items-center gap-1.5 rounded-full border border-border/50 bg-surface-1/70 px-2 py-1 text-[11px] text-muted-foreground cursor-pointer focus-within:outline-none focus-within:ring-2 focus-within:ring-primary/30 focus-within:ring-offset-2 focus-within:ring-offset-background">
              <input
                type="checkbox"
                checked={includeContent}
                onChange={(event) => onIncludeContentChange(event.target.checked)}
                className="h-3.5 w-3.5 rounded border-border accent-primary"
                aria-label="Include content in diagnostics"
              />
              <span>Content</span>
            </label>
          )}
          {onShare && (
            <Tooltip content="Share" side="bottom">
              <span>
                <Button
                  type="button"
                  size="compact"
                  variant="ghost"
                  onClick={onShare}
                  disabled={shareDisabled}
                  className="h-7 w-7 p-0"
                  aria-label="Share"
                >
                  <Share2 className="h-4 w-4" />
                </Button>
              </span>
            </Tooltip>
          )}
        </div>
      </div>
    </div>
  );
}
