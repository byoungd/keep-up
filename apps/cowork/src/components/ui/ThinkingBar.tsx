import type * as React from "react";
import { cn } from "../../lib/cn";

export interface ThinkingBarProps extends React.HTMLAttributes<HTMLOutputElement> {
  ariaLabel?: string;
}

export function ThinkingBar({ ariaLabel = "Thinking", className, ...props }: ThinkingBarProps) {
  return (
    <output
      aria-label={ariaLabel}
      aria-live="polite"
      className={cn(
        "relative block h-2 w-full overflow-hidden rounded-full bg-surface-2",
        className
      )}
      {...props}
    >
      <span className="ai-sheen-line pointer-events-none absolute inset-x-0 top-1/2 -translate-y-1/2" />
    </output>
  );
}
