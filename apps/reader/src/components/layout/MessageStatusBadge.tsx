"use client";

import { cn } from "@keepup/shared/utils";
import { AlertTriangle, CheckCircle2, Square } from "lucide-react";
import type * as React from "react";
import type { MessageStatus } from "./MessageItem";

const STATUS_META: Record<MessageStatus, { className: string; icon: React.ReactNode }> = {
  streaming: {
    className: "text-primary/50",
    icon: <div className="h-1.5 w-1.5 rounded-full bg-current animate-pulse" />,
  },
  done: {
    className: "text-success",
    icon: <CheckCircle2 className="h-3 w-3" />,
  },
  error: {
    className: "text-destructive",
    icon: <AlertTriangle className="h-3 w-3" />,
  },
  canceled: {
    className: "text-muted-foreground",
    icon: <Square className="h-3 w-3" />,
  },
};

export function MessageStatusBadge({
  status,
  labels,
}: {
  status?: MessageStatus;
  labels: Record<MessageStatus, string>;
}) {
  // For Linear-quality UI, we hide status badges for normal states (streaming, done)
  // as they are redundant or noisy. Only show for exceptions (error, canceled).
  if (!status || status === "streaming" || status === "done") {
    return null;
  }
  const meta = STATUS_META[status];
  const showLabel = true; // For error/canceled, always show label for clarity

  return (
    <span className={cn("inline-flex items-center gap-1.5 text-[10px]", meta.className)}>
      {meta.icon}
      {showLabel && (
        <span className="opacity-80 font-medium uppercase tracking-wider">{labels[status]}</span>
      )}
    </span>
  );
}
