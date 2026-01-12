/**
 * SuggestionsPanel - AI suggestions sidebar panel
 *
 * Displays list of AI suggestions with filtering and actions.
 */

"use client";

import { cn } from "@/lib/utils";
import { Loader2, RefreshCw, Sparkles, Undo2 } from "lucide-react";
import type * as React from "react";

import { Button } from "@/components/ui/Button";
import type { SuggestionStatus, UseSuggestionsReturn } from "@/hooks/useSuggestions";
import { SuggestionCard } from "./SuggestionCard";

interface SuggestionsPanelProps {
  /** Suggestions hook return */
  suggestions: UseSuggestionsReturn;
  /** Filter by status */
  statusFilter?: SuggestionStatus | "all";
  /** Additional CSS classes */
  className?: string;
}

/**
 * Empty state component.
 */
function EmptyState({ isEnabled }: { isEnabled: boolean }): React.ReactElement {
  if (!isEnabled) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center">
        <Sparkles className="h-8 w-8 text-muted-foreground/50 mb-2" aria-hidden="true" />
        <p className="text-sm text-muted-foreground">AI suggestions are disabled</p>
        <p className="text-xs text-muted-foreground/70 mt-1">
          Enable AI suggestions in settings to get writing assistance
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center py-8 text-center">
      <Sparkles className="h-8 w-8 text-muted-foreground/50 mb-2" aria-hidden="true" />
      <p className="text-sm text-muted-foreground">No suggestions yet</p>
      <p className="text-xs text-muted-foreground/70 mt-1">
        Select some text to get AI suggestions
      </p>
    </div>
  );
}

/**
 * Loading state component.
 */
function LoadingState(): React.ReactElement {
  return (
    <div className="flex flex-col items-center justify-center py-8">
      <Loader2 className="h-6 w-6 text-primary animate-spin mb-2" />
      <p className="text-sm text-muted-foreground">Generating suggestions...</p>
    </div>
  );
}

/**
 * Error state component.
 */
function ErrorState({
  error,
  onRetry,
}: { error: string; onRetry: () => void }): React.ReactElement {
  return (
    <div className="flex flex-col items-center justify-center py-8 text-center">
      <p className="text-sm text-error mb-2">{error}</p>
      <Button type="button" variant="ghost" size="sm" onClick={onRetry}>
        <RefreshCw className="h-3.5 w-3.5 mr-1" />
        Try again
      </Button>
    </div>
  );
}

/**
 * SuggestionsPanel component.
 */
export function SuggestionsPanel({
  suggestions,
  statusFilter = "all",
  className,
}: SuggestionsPanelProps): React.ReactElement {
  const {
    suggestions: suggestionList,
    isLoading,
    error,
    isEnabled,
    lastAppliedId,
    applySuggestion,
    rejectSuggestion,
    undoLastApplied,
    refresh,
    clearSuggestions,
  } = suggestions;

  // Filter suggestions by status
  const filteredSuggestions =
    statusFilter === "all"
      ? suggestionList
      : suggestionList.filter((s) => s.status === statusFilter);

  // Count by status
  const pendingCount = suggestionList.filter((s) => s.status === "pending").length;
  const appliedCount = suggestionList.filter((s) => s.status === "applied").length;

  return (
    <div
      data-testid="suggestions-panel"
      className={cn("flex flex-col h-full bg-surface-1", className)}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/60">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" aria-hidden="true" />
          <span className="font-medium text-sm">AI Suggestions</span>
          {pendingCount > 0 && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary">
              {pendingCount}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {lastAppliedId && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={undoLastApplied}
              aria-label="Undo last applied suggestion"
              className="h-7 w-7"
            >
              <Undo2 className="h-3.5 w-3.5" />
            </Button>
          )}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={refresh}
            disabled={isLoading}
            aria-label="Refresh suggestions"
            className="h-7 w-7"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", isLoading && "animate-spin")} />
          </Button>
        </div>
      </div>

      {/* Stats bar */}
      {suggestionList.length > 0 && (
        <div className="flex items-center gap-3 px-4 py-2 text-[10px] text-muted-foreground border-b border-border/40">
          <span>{suggestionList.length} total</span>
          <span>•</span>
          <span>{pendingCount} pending</span>
          <span>•</span>
          <span>{appliedCount} applied</span>
          {suggestionList.length > 0 && (
            <button
              type="button"
              onClick={clearSuggestions}
              className="ml-auto text-muted-foreground hover:text-foreground"
            >
              Clear all
            </button>
          )}
        </div>
      )}

      {/* Content */}
      {/* biome-ignore lint/a11y/noNoninteractiveTabindex: scrollable region needs keyboard access */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3" tabIndex={0}>
        {isLoading && suggestionList.length === 0 ? (
          <LoadingState />
        ) : error && suggestionList.length === 0 ? (
          <ErrorState error={error} onRetry={refresh} />
        ) : filteredSuggestions.length === 0 ? (
          <EmptyState isEnabled={isEnabled} />
        ) : (
          filteredSuggestions.map((suggestion) => (
            <SuggestionCard
              key={suggestion.id}
              suggestion={suggestion}
              onApply={applySuggestion}
              onReject={rejectSuggestion}
            />
          ))
        )}
      </div>
    </div>
  );
}
