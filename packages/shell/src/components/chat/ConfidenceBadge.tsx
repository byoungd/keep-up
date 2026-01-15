/**
 * ConfidenceBadge Component
 *
 * Displays AI confidence score with visual indicators.
 * Shows provenance information on hover.
 */

"use client";

import { cn } from "@ku0/shared/utils";
import { Tooltip, TooltipProvider } from "@radix-ui/react-tooltip";
import type * as React from "react";

/** Confidence level thresholds */
const CONFIDENCE_THRESHOLDS = {
  high: 0.8,
  medium: 0.5,
} as const;

/** AI Provenance metadata */
export interface AIProvenance {
  model_id: string;
  prompt_hash?: string;
  prompt_template_id?: string;
  input_context_hashes?: string[];
  rationale_summary?: string;
  temperature?: number;
  timestamp?: number;
}

/** ConfidenceBadge props */
export interface ConfidenceBadgeProps {
  /** Confidence score (0-1) */
  score: number;
  /** Provenance metadata */
  provenance?: AIProvenance;
  /** Size variant */
  size?: "sm" | "md";
  /** Additional CSS classes */
  className?: string;
}

/**
 * Get confidence level from score.
 */
function getConfidenceLevel(score: number): "high" | "medium" | "low" {
  if (score >= CONFIDENCE_THRESHOLDS.high) {
    return "high";
  }
  if (score >= CONFIDENCE_THRESHOLDS.medium) {
    return "medium";
  }
  return "low";
}

/**
 * Get display label for confidence level.
 */
function getConfidenceLabel(level: "high" | "medium" | "low"): string {
  switch (level) {
    case "high":
      return "High confidence";
    case "medium":
      return "Medium confidence";
    case "low":
      return "Low confidence";
  }
}

/**
 * ConfidenceBadge component.
 * Displays a visual indicator of AI confidence with provenance tooltip.
 */
export function ConfidenceBadge({
  score,
  provenance,
  size = "sm",
  className,
}: ConfidenceBadgeProps): React.ReactElement {
  const level = getConfidenceLevel(score);
  const percentage = Math.round(score * 100);

  const badgeContent = (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full font-medium relative overflow-hidden",
        "transition-colors duration-150",
        // Size variants
        size === "sm" && "px-1.5 py-0.5 text-[10px]",
        size === "md" && "px-2 py-1 text-xs",
        // Level-based colors
        level === "high" && "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
        level === "medium" && "bg-amber-500/15 text-amber-600 dark:text-amber-400",
        level === "low" && "bg-rose-500/15 text-rose-600 dark:text-rose-400",
        // Shimmer animation class
        "group",
        className
      )}
      data-testid="confidence-badge"
      data-confidence-level={level}
    >
      {/* Shimmer overlay */}
      <span
        className={cn(
          "absolute inset-0 -translate-x-full",
          "bg-gradient-to-r from-transparent via-white/20 to-transparent",
          "group-hover:translate-x-full transition-transform duration-700 ease-out"
        )}
        aria-hidden="true"
      />
      {/* Confidence dot indicator */}
      <span
        className={cn(
          "size-1.5 rounded-full relative",
          level === "high" && "bg-emerald-500",
          level === "medium" && "bg-amber-500",
          level === "low" && "bg-rose-500"
        )}
        aria-hidden="true"
      />
      <span className="relative">{percentage}%</span>
    </span>
  );

  // If no provenance, render badge without tooltip
  if (!provenance) {
    return badgeContent;
  }

  // Build tooltip content
  const _tooltipContent = (
    <div className="space-y-1">
      <div className="font-medium">{getConfidenceLabel(level)}</div>
      <div className="text-muted-foreground">
        <div>Model: {provenance.model_id}</div>
        {provenance.temperature !== undefined && <div>Temperature: {provenance.temperature}</div>}
        {provenance.prompt_hash && (
          <div className="font-mono truncate">Prompt: {provenance.prompt_hash.slice(0, 8)}...</div>
        )}
        {provenance.prompt_template_id && <div>Template: {provenance.prompt_template_id}</div>}
        {provenance.input_context_hashes && provenance.input_context_hashes.length > 0 && (
          <div>Context hashes: {provenance.input_context_hashes.length}</div>
        )}
        {provenance.rationale_summary && <div>Rationale: {provenance.rationale_summary}</div>}
      </div>
    </div>
  );

  // Render with tooltip showing provenance
  return (
    <TooltipProvider>
      <Tooltip>
        {/* TooltipTrigger and Content would be needed here, adapting to custom Tooltip component */}
        {badgeContent}
      </Tooltip>
    </TooltipProvider>
  );
}

/**
 * ConfidenceBar - Alternative linear visualization.
 */
export interface ConfidenceBarProps {
  score: number;
  className?: string;
}

export function ConfidenceBar({ score, className }: ConfidenceBarProps): React.ReactElement {
  const level = getConfidenceLevel(score);
  const percentage = Math.round(score * 100);

  return (
    <div className={cn("flex items-center gap-2", className)} data-testid="confidence-bar">
      <div className="h-1 flex-1 rounded-full bg-muted overflow-hidden">
        <div
          className={cn(
            "h-full rounded-full transition-all duration-300",
            level === "high" && "bg-emerald-500",
            level === "medium" && "bg-amber-500",
            level === "low" && "bg-rose-500"
          )}
          style={{ width: `${percentage}%` }}
        />
      </div>
      <span className="text-[10px] text-muted-foreground tabular-nums">{percentage}%</span>
    </div>
  );
}
