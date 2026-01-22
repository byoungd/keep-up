"use client";

import { cn } from "@ku0/shared/utils";
import { Loader } from "../ai-elements/loader";

export type AILoadingState = "idle" | "connecting" | "thinking" | "streaming";

interface AILoadingStatusProps {
  state: AILoadingState;
  className?: string;
}

/**
 * AI Loading Status Component (Linear-style Redesign)
 * Minimalist, unified status indicator.
 */
export function AILoadingStatus({ state, className }: AILoadingStatusProps) {
  if (state === "idle") {
    return null;
  }

  const label =
    state === "streaming"
      ? "Generating..."
      : state === "connecting"
        ? "Thinking..."
        : "Thinking...";

  return (
    <Loader
      size="sm"
      label={label}
      className={cn(
        "px-3 py-2 text-muted-foreground/40 select-none",
        "animate-in fade-in slide-in-from-bottom-1 duration-300",
        className
      )}
    />
  );
}
