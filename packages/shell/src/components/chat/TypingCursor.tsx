"use client";

import { cn } from "@ku0/shared/utils";
import { motion, useReducedMotion } from "framer-motion";

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
  const prefersReducedMotion = useReducedMotion();

  const variantStyles = {
    default: "w-[2px] h-[1em] bg-primary",
    subtle: "w-[1.5px] h-[0.9em] bg-muted-foreground/60",
    prominent: "w-[2.5px] h-[1.1em] bg-primary shadow-sm shadow-primary/30",
  };

  // Static cursor for reduced motion or inactive state
  if (prefersReducedMotion || !isActive) {
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

  return (
    <motion.span
      className={cn(
        "inline-block ml-0.5 align-middle rounded-full",
        variantStyles[variant],
        className
      )}
      initial={{ opacity: 1 }}
      animate={{
        opacity: [1, 0.4, 1],
        boxShadow: [
          "0 0 4px 1px rgba(var(--color-primary), 0.5)",
          "0 0 8px 2px rgba(var(--color-primary), 0.3)",
          "0 0 4px 1px rgba(var(--color-primary), 0.5)",
        ],
      }}
      transition={{
        duration: 1.2,
        repeat: Number.POSITIVE_INFINITY,
        ease: "easeInOut",
      }}
      aria-hidden="true"
    />
  );
}

/**
 * Thinking indicator with animated dots.
 * Shows while waiting for first AI token.
 */
export function ThinkingIndicator({ className }: { className?: string }) {
  const prefersReducedMotion = useReducedMotion();

  if (prefersReducedMotion) {
    return (
      <span className={cn("inline-flex gap-1 text-muted-foreground", className)}>
        <span className="w-1.5 h-1.5 rounded-full bg-current opacity-60" />
        <span className="w-1.5 h-1.5 rounded-full bg-current opacity-60" />
        <span className="w-1.5 h-1.5 rounded-full bg-current opacity-60" />
      </span>
    );
  }

  return (
    // biome-ignore lint/a11y/useAriaPropsSupportedByRole: Status indicator
    <span className={cn("inline-flex gap-1 items-center", className)} aria-label="Thinking">
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="w-1.5 h-1.5 rounded-full bg-muted-foreground"
          initial={{ opacity: 0.4, scale: 0.8 }}
          animate={{
            opacity: [0.4, 1, 0.4],
            scale: [0.8, 1, 0.8],
          }}
          transition={{
            duration: 1.2,
            repeat: Number.POSITIVE_INFINITY,
            delay: i * 0.2,
            ease: "easeInOut",
          }}
        />
      ))}
    </span>
  );
}
