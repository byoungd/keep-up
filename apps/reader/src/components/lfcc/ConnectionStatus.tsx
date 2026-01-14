"use client";

import type { SyncClientState } from "@ku0/core";
import { cn } from "@ku0/shared/utils";

export interface ConnectionStatusProps {
  state: SyncClientState;
  error?: string | null;
  className?: string;
}

const STATUS_CONFIG: Record<
  SyncClientState,
  { label: string; colorClass: string; pulse: boolean }
> = {
  disconnected: { label: "Offline", colorClass: "bg-muted-foreground", pulse: false },
  connecting: { label: "Connecting...", colorClass: "bg-warning", pulse: true },
  handshaking: { label: "Syncing...", colorClass: "bg-warning", pulse: true },
  connected: { label: "Connected", colorClass: "bg-success", pulse: false },
  reconnecting: { label: "Reconnecting...", colorClass: "bg-warning", pulse: true },
  error: { label: "Error", colorClass: "bg-error", pulse: false },
};

/**
 * Connection status indicator with animated pulse for connecting states
 */
export function ConnectionStatus({ state, error, className }: ConnectionStatusProps) {
  const config = STATUS_CONFIG[state];

  return (
    <div
      data-testid="collab-connection-status"
      className={cn("flex items-center gap-1.5 text-xs text-muted-foreground", className)}
      title={error ?? config.label}
    >
      <div
        className={cn(
          "h-2 w-2 rounded-full transition-all duration-300",
          config.colorClass,
          config.pulse && "animate-pulse"
        )}
      />
      <span className="font-medium">{config.label}</span>
    </div>
  );
}
