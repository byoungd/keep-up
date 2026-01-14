"use client";

import { cn } from "@ku0/shared/utils";
import { Zap } from "lucide-react";

export interface TokenUsageStats {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  contextWindow?: number;
  utilization?: number;
}

export interface TokenUsageDisplayProps {
  usage: TokenUsageStats;
  className?: string;
  showDetails?: boolean;
}

/**
 * Display token usage statistics with visual indicators.
 * Shows input/output tokens and context window utilization.
 */
export function TokenUsageDisplay({
  usage,
  className,
  showDetails = false,
}: TokenUsageDisplayProps) {
  const utilization = usage.utilization ?? 0;

  // Color based on utilization
  const utilizationColor =
    utilization > 80
      ? "text-destructive"
      : utilization > 60
        ? "text-warning"
        : "text-muted-foreground";

  const utilizationBgColor =
    utilization > 80 ? "bg-destructive/20" : utilization > 60 ? "bg-warning/20" : "bg-muted/50";

  return (
    <div
      className={cn(
        "inline-flex items-center gap-2 rounded-md px-2 py-1 text-xs",
        utilizationBgColor,
        className
      )}
    >
      <Zap className={cn("h-3 w-3", utilizationColor)} aria-hidden="true" />

      {showDetails ? (
        <div className="flex items-center gap-2">
          <span className={utilizationColor}>
            {usage.inputTokens.toLocaleString()}⏎ + {usage.outputTokens.toLocaleString()}⏏
          </span>
          <span className="text-muted-foreground">/</span>
          <span className={cn("font-medium", utilizationColor)}>{utilization.toFixed(1)}%</span>
        </div>
      ) : (
        <span className={utilizationColor}>{usage.totalTokens.toLocaleString()} tokens</span>
      )}

      {/* Context window visualization bar */}
      {showDetails && (
        <div className="relative h-2 w-16 rounded-full bg-surface-3 overflow-hidden">
          <div
            className={cn(
              "absolute left-0 top-0 h-full rounded-full transition-all",
              utilization > 80
                ? "bg-destructive"
                : utilization > 60
                  ? "bg-warning"
                  : "bg-primary/60"
            )}
            style={{ width: `${Math.min(utilization, 100)}%` }}
            aria-label={`Context window ${utilization.toFixed(1)}% used`}
          />
        </div>
      )}
    </div>
  );
}
