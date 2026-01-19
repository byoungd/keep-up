import type * as React from "react";
import { cn } from "../../lib/cn";

export interface ThinkingBarProps extends React.HTMLAttributes<HTMLOutputElement> {
  ariaLabel?: string;
}

export function ThinkingBar({ ariaLabel = "Thinking", className, ...props }: ThinkingBarProps) {
  return (
    <output
      aria-label={ariaLabel}
      className={cn(
        "thinking-bar relative block h-1.5 w-full overflow-hidden rounded-full bg-surface-2",
        className
      )}
      {...props}
    >
      <div className="thinking-bar__fill absolute inset-0" />
    </output>
  );
}
