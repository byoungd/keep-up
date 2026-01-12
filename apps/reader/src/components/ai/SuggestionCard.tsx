/**
 * SuggestionCard - Individual AI suggestion display
 *
 * Shows suggestion content, citations, and apply/reject actions.
 */

"use client";

import { cn } from "@/lib/utils";
import { Check, ChevronDown, ChevronUp, ExternalLink, Sparkles, X } from "lucide-react";
import type * as React from "react";
import { useState } from "react";

import { Button } from "@/components/ui/Button";
import type { Citation, Suggestion, SuggestionStatus } from "@/hooks/useSuggestions";

interface SuggestionCardProps {
  /** The suggestion to display */
  suggestion: Suggestion;
  /** Apply callback */
  onApply: (id: string) => void;
  /** Reject callback */
  onReject: (id: string) => void;
  /** Additional CSS classes */
  className?: string;
}

/** Status badge styles */
const statusStyles: Record<SuggestionStatus, string> = {
  pending: "bg-primary/10 text-primary",
  applied: "bg-success/10 text-success",
  rejected: "bg-muted text-muted-foreground",
  expired: "bg-muted text-muted-foreground",
};

/** Status labels */
const statusLabels: Record<SuggestionStatus, string> = {
  pending: "Pending",
  applied: "Applied",
  rejected: "Rejected",
  expired: "Expired",
};

/**
 * Citation item component.
 */
function CitationItem({ citation }: { citation: Citation }): React.ReactElement {
  return (
    <div className="flex items-start gap-2 rounded-md bg-surface-2 p-2 text-xs">
      <div className="flex-1 min-w-0">
        <div className="font-medium truncate">{citation.title}</div>
        {citation.excerpt && (
          <div className="text-muted-foreground line-clamp-2 mt-0.5">{citation.excerpt}</div>
        )}
      </div>
      {citation.url && (
        <a
          href={citation.url}
          target="_blank"
          rel="noopener noreferrer"
          className="shrink-0 text-primary hover:text-primary/80"
          aria-label={`Open source: ${citation.title}`}
        >
          <ExternalLink className="h-3.5 w-3.5" />
        </a>
      )}
    </div>
  );
}

/**
 * SuggestionCard component.
 */
export function SuggestionCard({
  suggestion,
  onApply,
  onReject,
  className,
}: SuggestionCardProps): React.ReactElement {
  const [isExpanded, setIsExpanded] = useState(false);
  const isPending = suggestion.status === "pending";
  const hasCitations = suggestion.citations.length > 0;

  return (
    <div
      data-testid="suggestion-card"
      data-suggestion-id={suggestion.id}
      className={cn(
        "rounded-lg border border-border/60 bg-surface-1 overflow-hidden",
        !isPending && "opacity-60",
        className
      )}
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border/40">
        <Sparkles className="h-4 w-4 text-primary shrink-0" aria-hidden="true" />
        <span className="text-xs font-medium text-muted-foreground">AI Suggestion</span>
        <span
          className={cn(
            "ml-auto text-[10px] px-1.5 py-0.5 rounded-full",
            statusStyles[suggestion.status]
          )}
        >
          {statusLabels[suggestion.status]}
        </span>
      </div>

      {/* Content */}
      <div className="p-3">
        <div className={cn("text-sm", !isExpanded && "line-clamp-3")}>{suggestion.content}</div>

        {/* Expand/collapse for long content */}
        {suggestion.content.length > 200 && (
          <button
            type="button"
            onClick={() => setIsExpanded(!isExpanded)}
            className="mt-1 text-xs text-primary hover:text-primary/80 flex items-center gap-0.5"
          >
            {isExpanded ? (
              <>
                <ChevronUp className="h-3 w-3" />
                Show less
              </>
            ) : (
              <>
                <ChevronDown className="h-3 w-3" />
                Show more
              </>
            )}
          </button>
        )}

        {/* Citations */}
        {hasCitations && (
          <div className="mt-3 space-y-1.5">
            <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
              Sources ({suggestion.citations.length})
            </div>
            {suggestion.citations.map((citation) => (
              <CitationItem key={citation.id} citation={citation} />
            ))}
          </div>
        )}

        {/* Confidence */}
        <div className="mt-2 flex items-center gap-1.5 text-[10px] text-muted-foreground">
          <span>Confidence:</span>
          <div className="flex-1 h-1 bg-surface-2 rounded-full overflow-hidden max-w-[60px]">
            <div
              className="h-full bg-primary rounded-full"
              style={{ width: `${suggestion.confidence * 100}%` }}
            />
          </div>
          <span>{Math.round(suggestion.confidence * 100)}%</span>
        </div>
      </div>

      {/* Actions */}
      {isPending && (
        <div className="flex items-center gap-2 px-3 py-2 border-t border-border/40 bg-surface-2/50">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onReject(suggestion.id)}
            className="flex-1 text-muted-foreground hover:text-foreground"
          >
            <X className="h-3.5 w-3.5 mr-1" />
            Reject
          </Button>
          <Button
            type="button"
            variant="primary"
            size="sm"
            onClick={() => onApply(suggestion.id)}
            className="flex-1"
          >
            <Check className="h-3.5 w-3.5 mr-1" />
            Apply
          </Button>
        </div>
      )}
    </div>
  );
}
