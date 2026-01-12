"use client";

import { Tooltip } from "@/components/ui/Tooltip";
import { cn } from "@keepup/shared/utils";
import { AlertCircle, AlertTriangle, Cloud, CloudOff, RefreshCw } from "lucide-react";

export type SyncState = "connected" | "reconnecting" | "offline" | "diverged" | "degraded";

/** Threshold for pending ops to show degraded state */
export const DEGRADED_PENDING_OPS_THRESHOLD = 10;

export interface SyncStatusProps {
  state: SyncState;
  lastSyncAt?: Date;
  peerCount?: number;
  pendingOps?: number;
  className?: string;
}

const stateConfig: Record<
  SyncState,
  { icon: React.ElementType; label: string; color: string; description: string }
> = {
  connected: {
    icon: Cloud,
    label: "Connected",
    color: "text-success",
    description: "All changes are synced in real-time.",
  },
  reconnecting: {
    icon: RefreshCw,
    label: "Reconnecting",
    color: "text-warning",
    description: "Attempting to restore connection. Your edits are saved locally.",
  },
  offline: {
    icon: CloudOff,
    label: "Offline",
    color: "text-muted-foreground",
    description: "You're offline. Edits will sync when you're back online.",
  },
  diverged: {
    icon: AlertTriangle,
    label: "Diverged",
    color: "text-error",
    description: "A sync conflict was detected. See the banner for recovery options.",
  },
  degraded: {
    icon: AlertCircle,
    label: "Syncing",
    color: "text-warning",
    description: "High pending changes. Sync may be delayed.",
  },
};

export function SyncStatus({
  state,
  lastSyncAt,
  peerCount,
  pendingOps,
  className,
}: SyncStatusProps) {
  // Derive effective state: if connected but too many pending ops, show degraded
  const effectiveState =
    state === "connected" &&
    pendingOps !== undefined &&
    pendingOps >= DEGRADED_PENDING_OPS_THRESHOLD
      ? "degraded"
      : state;

  const config = stateConfig[effectiveState];
  const Icon = config.icon;

  const formatTime = (date: Date) => {
    const now = new Date();
    const diff = Math.floor((now.getTime() - date.getTime()) / 1000);
    if (diff < 5) {
      return "just now";
    }
    if (diff < 60) {
      return `${diff}s ago`;
    }
    if (diff < 3600) {
      return `${Math.floor(diff / 60)}m ago`;
    }
    return date.toLocaleTimeString();
  };

  return (
    <div className={cn("flex items-center gap-2 text-xs font-medium", className)}>
      <Tooltip content={config.description} side="bottom">
        <div className={cn("flex items-center gap-1.5 cursor-help", config.color)}>
          <Icon
            className={cn("h-3.5 w-3.5", effectiveState === "reconnecting" && "animate-spin")}
          />
          <span>{config.label}</span>
        </div>
      </Tooltip>

      {peerCount !== undefined && peerCount > 0 && (
        <span className="text-muted-foreground">
          · {peerCount} peer{peerCount !== 1 ? "s" : ""}
        </span>
      )}

      {pendingOps !== undefined && pendingOps > 0 && (
        <Tooltip
          content={`${pendingOps} change${pendingOps !== 1 ? "s" : ""} waiting to sync. These are saved locally and will sync automatically.`}
          side="bottom"
        >
          <span
            className={cn(
              "cursor-help",
              pendingOps >= DEGRADED_PENDING_OPS_THRESHOLD
                ? "text-warning"
                : "text-muted-foreground"
            )}
          >
            · {pendingOps} pending
          </span>
        </Tooltip>
      )}

      {lastSyncAt && (effectiveState === "connected" || effectiveState === "degraded") && (
        <Tooltip content={`Last synced at ${lastSyncAt.toLocaleString()}`} side="bottom">
          <span className="text-muted-foreground cursor-help">
            · synced {formatTime(lastSyncAt)}
          </span>
        </Tooltip>
      )}
    </div>
  );
}
