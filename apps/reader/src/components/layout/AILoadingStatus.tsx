"use client";

import { cn } from "@ku0/shared/utils";
import { Loader2, Sparkles, Zap } from "lucide-react";

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

  const getStatusConfig = () => {
    switch (state) {
      case "connecting":
        return { icon: Zap, label: "Connecting..." };
      case "thinking":
        return { icon: Sparkles, label: "Thinking..." };
      case "streaming":
        return { icon: Loader2, label: "Generating..." };
      default:
        return { icon: null, label: "" };
    }
  };

  const { icon: Icon, label } = getStatusConfig();

  if (!Icon) {
    return null;
  }

  return (
    <div
      className={cn(
        "flex items-center gap-2 px-3 py-2 text-muted-foreground/40 select-none",
        "animate-in fade-in slide-in-from-bottom-1 duration-300",
        className
      )}
    >
      <Icon
        className={cn(
          "h-3 w-3",
          state === "streaming" || state === "thinking" ? "animate-pulse" : ""
        )}
      />
      <span className="text-[10px] font-medium tracking-normal opacity-80">{label}</span>
    </div>
  );
}
