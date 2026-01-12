/**
 * ResearchPanel - AI Research sidebar panel
 *
 * Displays research results with citations from RAG queries.
 * Allows users to search their knowledge base and get sourced answers.
 */

"use client";

import { cn } from "@/lib/utils";
import {
  BookOpen,
  ChevronDown,
  ChevronRight,
  Clock,
  ExternalLink,
  Loader2,
  Search,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import type * as React from "react";
import { type KeyboardEvent, useCallback } from "react";

import { Button } from "@/components/ui/Button";
import type {
  DisplayCitation,
  ResearchResult,
  UseResearchPanelReturn,
} from "@/hooks/useResearchPanel";

interface ResearchPanelProps {
  /** Research panel hook return */
  research: UseResearchPanelReturn;
  /** Additional CSS classes */
  className?: string;
  /** Callback when citation is clicked */
  onCitationClick?: (citation: DisplayCitation) => void;
}

/**
 * Citation card component.
 */
function CitationCard({
  citation,
  onToggle,
  onClick,
}: {
  citation: DisplayCitation;
  onToggle: () => void;
  onClick?: () => void;
}): React.ReactElement {
  const confidenceColor =
    citation.confidence >= 0.8
      ? "text-success"
      : citation.confidence >= 0.6
        ? "text-warning"
        : "text-muted-foreground";

  return (
    <div
      className={cn(
        "border border-border/60 rounded-md overflow-hidden",
        "bg-surface-1 hover:bg-surface-2 transition-colors"
      )}
    >
      <button
        type="button"
        className="w-full px-3 py-2 flex items-center gap-2 text-left"
        onClick={onToggle}
        aria-expanded={citation.isExpanded}
      >
        <span className="flex-shrink-0 w-5 h-5 rounded-full bg-primary/10 text-primary text-[10px] font-medium flex items-center justify-center">
          {citation.index}
        </span>
        <span className="flex-1 min-w-0">
          <span className="block text-sm font-medium truncate">
            {citation.title || `Source ${citation.index}`}
          </span>
          {citation.section && (
            <span className="block text-[10px] text-muted-foreground truncate">
              {citation.section}
            </span>
          )}
        </span>
        <span className={cn("text-[10px]", confidenceColor)}>
          {Math.round(citation.confidence * 100)}%
        </span>
        {citation.isExpanded ? (
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
        )}
      </button>

      {citation.isExpanded && (
        <div className="px-3 pb-3 pt-0">
          <p className="text-xs text-muted-foreground leading-relaxed">{citation.excerpt}</p>
          {onClick && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="mt-2 h-6 text-[10px]"
              onClick={onClick}
            >
              <ExternalLink className="h-3 w-3 mr-1" />
              View in document
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Answer display with inline citations.
 */
function AnswerDisplay({
  answer,
  onCitationClick,
}: {
  answer: string;
  onCitationClick?: (index: number) => void;
}): React.ReactElement {
  // Replace [1], [2], etc. with clickable badges
  const parts = answer.split(/(\[\d+\])/g);

  return (
    <div className="text-sm leading-relaxed">
      {parts.map((part, i) => {
        const citationMatch = part.match(/\[(\d+)\]/);
        if (citationMatch) {
          const index = Number.parseInt(citationMatch[1], 10);
          return (
            <button
              key={`citation-${i}-${index}`}
              type="button"
              className="inline-flex items-center justify-center w-4 h-4 mx-0.5 rounded-full bg-primary/10 text-primary text-[9px] font-medium hover:bg-primary/20 transition-colors"
              onClick={() => onCitationClick?.(index)}
              aria-label={`Citation ${index}`}
            >
              {index}
            </button>
          );
        }
        return <span key={`text-${i}-${part.slice(0, 10)}`}>{part}</span>;
      })}
    </div>
  );
}

/**
 * History item component.
 */
function HistoryItem({
  result,
  onSelect,
}: {
  result: ResearchResult;
  onSelect: () => void;
}): React.ReactElement {
  const timeAgo = formatTimeAgo(result.timestamp);

  return (
    <button
      type="button"
      className={cn(
        "w-full px-3 py-2 text-left",
        "hover:bg-surface-2 transition-colors",
        "border-b border-border/40 last:border-b-0"
      )}
      onClick={onSelect}
    >
      <span className="block text-sm truncate">{result.query}</span>
      <span className="flex items-center gap-1 text-[10px] text-muted-foreground mt-0.5">
        <Clock className="h-2.5 w-2.5" />
        {timeAgo}
        <span className="mx-1">•</span>
        {result.citations.length} sources
      </span>
    </button>
  );
}

/**
 * Format timestamp to relative time.
 */
function formatTimeAgo(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);

  if (seconds < 60) {
    return "just now";
  }
  if (seconds < 3600) {
    return `${Math.floor(seconds / 60)}m ago`;
  }
  if (seconds < 86400) {
    return `${Math.floor(seconds / 3600)}h ago`;
  }
  return `${Math.floor(seconds / 86400)}d ago`;
}

/**
 * ResearchPanel component.
 */
export function ResearchPanel({
  research,
  className,
  onCitationClick,
}: ResearchPanelProps): React.ReactElement {
  const {
    query,
    isLoading,
    error,
    result,
    history,
    setQuery,
    search,
    clearResult,
    clearHistory,
    toggleCitation,
    selectHistory,
  } = research;

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        search();
      }
    },
    [search]
  );

  const handleCitationClick = useCallback(
    (citation: DisplayCitation) => {
      onCitationClick?.(citation);
    },
    [onCitationClick]
  );

  return (
    <div
      data-testid="research-panel"
      className={cn("flex flex-col h-full bg-surface-1", className)}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/60">
        <div className="flex items-center gap-2">
          <BookOpen className="h-4 w-4 text-primary" aria-hidden="true" />
          <span className="font-medium text-sm">Research</span>
        </div>
      </div>

      {/* Search input */}
      <div className="px-3 py-3 border-b border-border/40">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about your documents..."
            className={cn(
              "w-full pl-9 pr-10 py-2 text-sm",
              "bg-surface-2 border border-border/60 rounded-md",
              "placeholder:text-muted-foreground/60",
              "focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40"
            )}
            aria-label="Research query"
          />
          {isLoading ? (
            <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-primary animate-spin" />
          ) : query ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="absolute right-1 top-1/2 -translate-y-1/2 h-6 w-6"
              onClick={() => setQuery("")}
              aria-label="Clear query"
            >
              <X className="h-3 w-3" />
            </Button>
          ) : null}
        </div>
        <Button
          type="button"
          variant="primary"
          size="sm"
          className="w-full mt-2"
          onClick={search}
          disabled={!query.trim() || isLoading}
        >
          <Sparkles className="h-3.5 w-3.5 mr-1.5" />
          Search Knowledge Base
        </Button>
      </div>

      {/* Content */}
      {/* biome-ignore lint/a11y/noNoninteractiveTabindex: scrollable region needs keyboard access */}
      <div className="flex-1 overflow-y-auto" tabIndex={0}>
        {/* Error state */}
        {error && <div className="px-4 py-3 bg-error/10 text-error text-sm">{error}</div>}

        {/* Result display */}
        {result && (
          <div className="p-4 space-y-4">
            {/* Answer */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Answer
                </h3>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-5 w-5"
                  onClick={clearResult}
                  aria-label="Clear result"
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
              <div className="p-3 bg-surface-2 rounded-md">
                <AnswerDisplay
                  answer={result.answer}
                  onCitationClick={(index) => toggleCitation(index)}
                />
              </div>
              <p className="text-[10px] text-muted-foreground mt-1">
                Generated in {result.processingTimeMs.toFixed(0)}ms
              </p>
            </div>

            {/* Citations */}
            {result.citations.length > 0 && (
              <div>
                <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
                  Sources ({result.citations.length})
                </h3>
                <div className="space-y-2">
                  {result.citations.map((citation) => (
                    <CitationCard
                      key={`${citation.docId}-${citation.index}`}
                      citation={citation}
                      onToggle={() => toggleCitation(citation.index)}
                      onClick={() => handleCitationClick(citation)}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Empty state with history */}
        {!result && !isLoading && (
          <div className="p-4">
            {history.length > 0 ? (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Recent Searches
                  </h3>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-5 w-5"
                    onClick={clearHistory}
                    aria-label="Clear history"
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
                <div className="border border-border/60 rounded-md overflow-hidden">
                  {history.map((item, index) => (
                    <HistoryItem
                      key={`${item.timestamp}-${item.query.slice(0, 20)}`}
                      result={item}
                      onSelect={() => selectHistory(index)}
                    />
                  ))}
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <BookOpen className="h-8 w-8 text-muted-foreground/50 mb-2" aria-hidden="true" />
                <p className="text-sm text-muted-foreground">Search your knowledge base</p>
                <p className="text-xs text-muted-foreground/70 mt-1">
                  Ask questions about your documents and get sourced answers
                </p>
              </div>
            )}
          </div>
        )}

        {/* Loading state */}
        {isLoading && !result && (
          <div className="flex flex-col items-center justify-center py-8">
            <Loader2 className="h-6 w-6 text-primary animate-spin mb-2" />
            <p className="text-sm text-muted-foreground">Searching knowledge base...</p>
          </div>
        )}
      </div>
    </div>
  );
}
