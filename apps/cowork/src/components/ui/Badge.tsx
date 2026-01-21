import type * as React from "react";
import { cn } from "../../lib/cn";

type BadgeTone = "default" | "success" | "warning" | "error" | "info" | "ai";

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
}

const toneClasses: Record<BadgeTone, string> = {
  default: "bg-surface-2 text-muted-foreground",
  success: "bg-success/10 text-success border-success/20",
  warning: "bg-warning/10 text-warning border-warning/20",
  error: "bg-error/10 text-error border-error/20",
  info: "bg-info/10 text-info border-info/20",
  ai: "bg-accent-ai/10 text-accent-ai border-accent-ai/20",
};

export function Badge({ tone = "default", className, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border border-transparent px-2 py-0.5 text-fine font-medium",
        toneClasses[tone],
        className
      )}
      {...props}
    />
  );
}
