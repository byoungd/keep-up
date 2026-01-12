"use client";

import { Tooltip } from "@/components/ui/Tooltip";
import { cn } from "@/lib/utils";
import { Cloud, CloudOff, RefreshCw } from "lucide-react";
import { useTranslations } from "next-intl";
// Assuming useLoroWebSocketSync or similar hook exposes sync state
// For now, we'll create a mock hook or use a placeholder based on avail hooks
// Based on file scan, useLoroWebSocketSync seems relevant.

export type SyncState = "synced" | "syncing" | "offline" | "error";

interface SyncStatusProps {
  className?: string;
  state?: SyncState; // Optional for now until we hook it up
}

export function SyncStatus({ className, state = "synced" }: SyncStatusProps) {
  const _t = useTranslations("SyncStatus"); // Reserved for future i18n

  const statusConfig = {
    synced: {
      icon: Cloud,
      label: "Synced", // t('synced')
      className: "text-muted-foreground",
    },
    syncing: {
      icon: RefreshCw,
      label: "Syncing...", // t('syncing')
      className: "text-primary animate-spin",
    },
    offline: {
      icon: CloudOff,
      label: "Offline", // t('offline')
      className: "text-muted-foreground/50",
    },
    error: {
      icon: CloudOff,
      label: "Sync Error", // t('error')
      className: "text-destructive",
    },
  };

  const config = statusConfig[state];
  const Icon = config.icon;

  return (
    <Tooltip content={config.label} side="bottom">
      <div
        className={cn(
          "flex items-center justify-center w-8 h-8 rounded-full hover:bg-surface-2 transition-colors",
          className
        )}
        aria-label={config.label}
      >
        <Icon className={cn("w-4 h-4", config.className)} />
      </div>
    </Tooltip>
  );
}
