"use client";

import type { SyncClientState } from "@ku0/core";
import { cn } from "@ku0/shared/utils";

import { ConnectionStatus } from "@/components/lfcc/ConnectionStatus";

export type CollabStatusProps = {
  state: SyncClientState;
  error?: string | null;
  pendingUpdates?: number;
  lastSyncAt?: number | null;
  clientId?: string | null;
  docId?: string;
  className?: string;
};

function formatShortId(value?: string | null): string {
  if (!value) {
    return "--";
  }
  return value.slice(0, 6);
}

function formatSyncTime(value?: number | null): string {
  if (!value) {
    return "--";
  }
  return new Date(value).toLocaleTimeString();
}

export function CollabStatus({
  state,
  error,
  pendingUpdates,
  lastSyncAt,
  clientId,
  docId,
  className,
}: CollabStatusProps) {
  const pendingCount = pendingUpdates ?? 0;
  const isSyncing = state === "connecting" || state === "handshaking" || state === "reconnecting";

  return (
    <div className={cn("flex flex-col gap-1 text-[11px] text-muted-foreground", className)}>
      <div className="flex flex-wrap items-center gap-2" data-testid="collab-status">
        <ConnectionStatus state={state} error={error} />
        <span className="text-[11px] font-medium text-foreground/80 truncate max-w-[140px]">
          Doc: {docId ?? "--"}
        </span>
        <span className="text-[11px] text-muted-foreground/60">|</span>
        <span
          className="text-[11px] font-medium text-foreground/80 truncate max-w-[140px]"
          suppressHydrationWarning
        >
          Replica: {formatShortId(clientId)}
        </span>
        {pendingCount > 0 && (
          <span className="ml-1 inline-flex items-center gap-1 rounded-full bg-accent-amber/15 px-2 py-0.5 text-[10px] font-semibold text-accent-amber">
            <span className="h-1.5 w-1.5 rounded-full bg-accent-amber" />
            Pending
          </span>
        )}
      </div>
      <div
        className={cn(
          "flex flex-wrap items-center gap-2 text-[10px] text-foreground/70",
          isSyncing && "animate-pulse"
        )}
      >
        <span data-testid="collab-last-sync">Last sync: {formatSyncTime(lastSyncAt)}</span>
        <span className="text-foreground/50">|</span>
        <span data-testid="collab-pending">Pending ops: {pendingCount}</span>
      </div>
    </div>
  );
}
