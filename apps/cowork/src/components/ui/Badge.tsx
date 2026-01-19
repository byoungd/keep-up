import type * as React from "react";
import { cn } from "../../lib/cn";

type BadgeTone = "default" | "success" | "warning" | "error" | "info" | "ai";

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
}

const toneClasses: Record<BadgeTone, string> = {
  default: "bg-surface-2 text-muted-foreground",
  success: "bg-success/10 text-success",
  warning: "bg-warning/10 text-warning",
  error: "bg-error/10 text-error",
  info: "bg-info/10 text-info",
  ai: "bg-accent-ai/10 text-accent-ai",
};

export function Badge({ tone = "default", className, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-sm px-2 py-0.5 text-tiny font-medium",
        toneClasses[tone],
        className
      )}
      {...props}
    />
  );
}
