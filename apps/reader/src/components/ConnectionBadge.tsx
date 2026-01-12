"use client";

/**
 * ConnectionBadge - Shows sync connection status
 */

import { cn } from "@/lib/utils";
import type { SyncClientState } from "@keepup/core";
import type * as React from "react";

interface ConnectionBadgeProps {
  state: SyncClientState;
  pendingUpdates?: number;
  className?: string;
}

const stateConfig: Record<SyncClientState, { label: string; color: string; icon: string }> = {
  connected: { label: "Online", color: "bg-success", icon: "●" },
  connecting: { label: "Connecting", color: "bg-warning", icon: "◐" },
  handshaking: { label: "Handshaking", color: "bg-warning", icon: "◐" },
  reconnecting: { label: "Reconnecting", color: "bg-warning", icon: "↻" },
  disconnected: { label: "Offline", color: "bg-muted-foreground", icon: "○" },
  error: { label: "Error", color: "bg-error", icon: "✕" },
};

export function ConnectionBadge({
  state,
  pendingUpdates = 0,
  className,
}: ConnectionBadgeProps): React.ReactElement {
  const config = stateConfig[state];
  const showPending = state === "connected" && pendingUpdates > 0;

  return (
    <div
      data-testid="connection-status"
      className={cn(
        "flex items-center gap-1.5 rounded-full border border-border/60 bg-surface-1/70 px-2.5 py-1 text-[11px] font-medium shadow-sm",
        className
      )}
    >
      <span className={`inline-block h-1.5 w-1.5 rounded-full ${config.color}`} />
      <span className="text-foreground/80">{config.label}</span>
      {showPending && (
        <span className="text-[10px] text-muted-foreground">({pendingUpdates} syncing)</span>
      )}
    </div>
  );
}
