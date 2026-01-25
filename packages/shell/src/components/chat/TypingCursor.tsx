"use client";

import { cn } from "@ku0/shared/utils";

export interface TypingCursorProps {
  /** Additional CSS classes */
  className?: string;
  /** Whether the cursor is actively blinking (streaming in progress) */
  isActive?: boolean;
  /** Variant style */
  variant?: "default" | "subtle" | "prominent";
}

/**
 * Animated blinking cursor to show streaming is active.
 * Designed to be placed inline at the end of streaming content.
 *
 * Features:
 * - Smooth opacity animation (not harsh blink)
 * - Respects reduced motion preferences
 * - Multiple visual variants
 */
export function TypingCursor({
  className,
  isActive = true,
  variant = "default",
}: TypingCursorProps) {
  const variantStyles = {
    default: "w-[2px] h-[1em] bg-primary",
    subtle: "w-[1.5px] h-[0.9em] bg-muted-foreground/60",
    prominent: "w-[2.5px] h-[1.1em] bg-primary shadow-sm shadow-primary/30",
  };

  return (
    <span
      className={cn(
        "inline-block ml-0.5 align-middle rounded-full",
        variantStyles[variant],
        !isActive && "opacity-0",
        className
      )}
      aria-hidden="true"
    />
  );
}

/**
 * Thinking indicator with animated dots.
 * Shows while waiting for first AI token.
 */
export function ThinkingIndicator({ className }: { className?: string }) {
  return (
    // biome-ignore lint/a11y/useAriaPropsSupportedByRole: Status indicator
    <span
      className={cn("inline-flex gap-1 items-center text-muted-foreground", className)}
      aria-label="Thinking"
    >
      <span className="w-1.5 h-1.5 rounded-full bg-current opacity-60" />
      <span className="w-1.5 h-1.5 rounded-full bg-current opacity-60" />
      <span className="w-1.5 h-1.5 rounded-full bg-current opacity-60" />
    </span>
  );
}
