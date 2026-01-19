import type * as React from "react";
import { cn } from "../../lib/cn";

type StatusTone = "success" | "warning" | "error" | "info" | "muted" | "ai";
type StatusSize = "sm" | "md";

export interface StatusDotProps extends React.HTMLAttributes<HTMLSpanElement> {
  tone?: StatusTone;
  size?: StatusSize;
}

const toneClasses: Record<StatusTone, string> = {
  success: "bg-success",
  warning: "bg-warning",
  error: "bg-error",
  info: "bg-info",
  muted: "bg-muted-foreground",
  ai: "bg-accent-ai",
};

const sizeClasses: Record<StatusSize, string> = {
  sm: "h-2.5 w-2.5",
  md: "h-3.5 w-3.5",
};

/**
 * A simple status dot indicator.
 * For accessibility, wrap with a Tooltip if status needs description.
 */
export function StatusDot({ tone = "success", size = "sm", className, ...props }: StatusDotProps) {
  return (
    <span
      className={cn(
        "inline-flex rounded-full shrink-0",
        toneClasses[tone],
        sizeClasses[size],
        className
      )}
      aria-hidden="true"
      {...props}
    />
  );
}
