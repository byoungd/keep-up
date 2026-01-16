"use client";

import { cn } from "@ku0/shared/utils";
import { AlertTriangle, Square } from "lucide-react";
import * as React from "react";
import { Button } from "../ui/Button";
import type { MessageStatus } from "./types";

export interface MessageAlertLabels {
  titleError: string;
  titleCanceled: string;
  bodyError: string;
  bodyCanceled: string;
  retry: string;
}

export interface MessageAlertProps {
  status: MessageStatus;
  requestId?: string;
  requestIdLabel: string;
  labels: MessageAlertLabels;
  onRetry: () => void;
}

/**
 * Alert component for error/canceled message states.
 */
export const MessageAlert = React.memo(function MessageAlert({
  status,
  requestId,
  requestIdLabel,
  labels,
  onRetry,
}: MessageAlertProps) {
  if (status !== "error" && status !== "canceled") {
    return null;
  }

  const isError = status === "error";
  const title = isError ? labels.titleError : labels.titleCanceled;
  const body = isError ? labels.bodyError : labels.bodyCanceled;
  const tone = isError
    ? "border-destructive/30 bg-destructive/5 text-destructive"
    : "border-border/50 bg-surface-0/80 text-muted-foreground";

  return (
    <div className={cn("mt-3 rounded-lg border px-3 py-2 text-xs", tone)}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2">
          <span className="mt-0.5">
            {isError ? (
              <AlertTriangle className="h-3.5 w-3.5" />
            ) : (
              <Square className="h-3.5 w-3.5" />
            )}
          </span>
          <div className="space-y-1">
            <div className="font-medium">{title}</div>
            <div className="opacity-80">{body}</div>
            {requestId && (
              <div className="text-[10px] opacity-60">
                {requestIdLabel}: {requestId.slice(0, 12)}...
              </div>
            )}
          </div>
        </div>
        <Button variant="outline" size="compact" onClick={onRetry}>
          {labels.retry}
        </Button>
      </div>
    </div>
  );
});
