"use client";

import { AnnotationEmptyState } from "@/components/annotations/AnnotationEmptyState";
import { AnnotationListItem } from "@/components/annotations/AnnotationListItem";
import { AnnotationPanelHeader } from "@/components/annotations/AnnotationPanelHeader";
import {
  IssueActionButtons,
  type IssueActionHandlers,
} from "@/components/issues/IssueActionButtons";
import { Input } from "@/components/ui/Input";
import { getIssueDefinition, getIssueDefinitionForAnnotationState } from "@/lib/issues/issues";
import type { Annotation } from "@/lib/kernel/types";
import type { DiagnosticsSyncSummary } from "@/lib/lfcc/diagnosticsBundle";
import type { DisplayAnnoState } from "@keepup/core";
import { cn } from "@keepup/shared/utils";
import { X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { useKeyboardNav } from "@/hooks/useKeyboardNav";

export type AnnotationFilter = "all" | "active" | "issues";

const filterLabels: Record<AnnotationFilter, string> = {
  all: "All",
  active: "Active",
  issues: "Issues",
};

export type AnnotationPanelProps = {
  annotations: Annotation[];
  onSelect: (annotationId: string) => void;
  onDelete: (annotationId: string) => void;
  onResolve?: (annotationId: string) => void;
  onScrollTo?: (annotationId: string) => void;
  hoveredAnnotationId?: string | null;
  onHover?: (annotationId: string | null) => void;
  onCopyDiagnostics?: () => void;
  copyDiagnosticsDisabled?: boolean;
  selectedAnnotationId?: string | null;
  onShare?: () => void;
  onCopyLink?: (annotationId: string) => void;
  syncSummary?: DiagnosticsSyncSummary;
  showDiagnosticsToggle?: boolean;
  includeDiagnosticsContent?: boolean;
  onIncludeDiagnosticsContentChange?: (next: boolean) => void;
  issueActions?: IssueActionHandlers;
  isReadOnly?: boolean;
  missingAnnotationId?: string | null;
};

/** Severity order for sorting issues - higher = more severe */
const severityOrder = {
  blocking: 3,
  warn: 2,
  info: 1,
} as const;

const issueStates: DisplayAnnoState[] = [
  "orphan",
  "broken_grace",
  "active_partial",
  "active_unverified",
];

function getIssueSeverityRank(state: DisplayAnnoState): number {
  const issue = getIssueDefinitionForAnnotationState(state);
  if (!issue) {
    return 0;
  }
  return severityOrder[issue.severity] ?? 0;
}

function getIssueGroupLabel(state: DisplayAnnoState): string {
  const issue = getIssueDefinitionForAnnotationState(state);
  if (issue) {
    return issue.label;
  }
  return "Active";
}

/** Sort by severity (descending), then by first span start */
const sortBySeverityAndPosition = (a: Annotation, b: Annotation): number => {
  const sevA = getIssueSeverityRank(a.displayState);
  const sevB = getIssueSeverityRank(b.displayState);
  if (sevA !== sevB) {
    return sevB - sevA;
  }
  const startA = a.spans?.[0]?.start ?? 0;
  const startB = b.spans?.[0]?.start ?? 0;
  return startA - startB;
};

export function AnnotationPanel({
  annotations,
  onSelect,
  onDelete,
  onScrollTo,
  hoveredAnnotationId,
  onHover,
  onCopyDiagnostics,
  copyDiagnosticsDisabled,
  selectedAnnotationId,
  onShare,
  onCopyLink,
  syncSummary,
  showDiagnosticsToggle = false,
  includeDiagnosticsContent = false,
  onIncludeDiagnosticsContentChange,
  issueActions,
  isReadOnly = false,
  missingAnnotationId,
}: AnnotationPanelProps) {
  const [filter, setFilter] = useState<AnnotationFilter>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const listRef = useRef<HTMLUListElement>(null);
  const [missingDismissed, setMissingDismissed] = useState(false);
  const missingIssue = getIssueDefinition("MISSING");
  const missingShortId = missingAnnotationId ? missingAnnotationId.slice(0, 8) : null;

  useEffect(() => {
    void missingAnnotationId;
    setMissingDismissed(false);
  }, [missingAnnotationId]);

  const filteredAnnotations = useMemo(() => {
    let list: Annotation[];
    if (filter === "all") {
      list = annotations;
    } else if (filter === "active") {
      list = annotations.filter((a) => a.displayState === "active");
    } else if (filter === "issues") {
      list = annotations.filter((a) => issueStates.includes(a.displayState));
      list = [...list].sort(sortBySeverityAndPosition);
    } else {
      list = annotations;
    }

    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      list = list.filter((a) => a.content.toLowerCase().includes(query));
    }

    return list;
  }, [annotations, filter, searchQuery]);

  const { focusedId, handleKeyDown, setFocusedId } = useKeyboardNav({
    items: filteredAnnotations,
    getItemId: (anno) => anno.id,
    onSelect: (anno) => {
      // Toggle expanded state logic could be here if we tracked it in parent
      // For now, selecting mostly scrolls to or focuses
      onSelect(anno.id);
      // If we want to open the thread, we might need to tell ListItem?
      // ListItem manages its own state. We might need a "forceOpen" prop or context.
      // But typically "Select" just scrolls to it.
      // If we want Enter to open the thread, that's inside ListItem.
      // But `onSelect` prop on ListItem usually means "focus in editor".
      // Let's assume onSelect does what we want for now.
    },
    onEscape: () => {
      // Clear focus or perform other escape actions
    },
  });

  // Group annotations by displayState for Issues tab
  const groupedAnnotations = useMemo(() => {
    if (filter !== "issues") {
      return null;
    }
    const groups: Partial<Record<DisplayAnnoState, Annotation[]>> = {};
    for (const anno of filteredAnnotations) {
      const existing = groups[anno.displayState];
      if (existing) {
        existing.push(anno);
      } else {
        groups[anno.displayState] = [anno];
      }
    }
    return groups;
  }, [filter, filteredAnnotations]);

  const issueCounts = useMemo(() => {
    return annotations.filter((a) => issueStates.includes(a.displayState)).length;
  }, [annotations]);

  const missingActions = useMemo<IssueActionHandlers>(
    () => ({
      onReload: issueActions?.onReload,
      onDismiss: () => setMissingDismissed(true),
    }),
    [issueActions]
  );

  // Scroll selected annotation into view
  useEffect(() => {
    if (!selectedAnnotationId || !listRef.current) {
      return;
    }

    const element = listRef.current.querySelector(`[data-annotation-id="${selectedAnnotationId}"]`);
    if (element) {
      element.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [selectedAnnotationId]);

  return (
    <section
      aria-label="Annotations panel"
      data-testid="annotation-panel"
      className="flex flex-col h-full bg-transparent"
    >
      <AnnotationPanelHeader
        count={annotations.length}
        onCopyDiagnostics={onCopyDiagnostics}
        onShare={onShare}
        copyDisabled={copyDiagnosticsDisabled}
        syncSummary={syncSummary}
        showDiagnosticsToggle={showDiagnosticsToggle}
        includeContent={includeDiagnosticsContent}
        onIncludeContentChange={onIncludeDiagnosticsContentChange}
      />

      {missingAnnotationId && !missingDismissed && (
        <div className="mx-5 mb-3 rounded-md border border-accent-amber/30 bg-accent-amber/10 p-3 text-xs text-foreground/80">
          <div className="space-y-1">
            <div className="text-[11px] font-semibold text-foreground">{missingIssue.label}</div>
            <p className="leading-relaxed">{missingIssue.summary}</p>
            {missingShortId && (
              <p
                className="text-[10px] text-foreground/70"
                title={missingAnnotationId ?? undefined}
              >
                ID: {missingShortId}
              </p>
            )}
          </div>
          <IssueActionButtons issue={missingIssue} handlers={missingActions} className="mt-2" />
        </div>
      )}

      {/* Search bar */}
      <div className="px-4 py-3 border-b border-border/30 sm:px-5">
        <Input
          variant="search"
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
          placeholder="Search annotations..."
          aria-label="Search annotations"
          rightIcon={
            searchQuery ? (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="rounded-full p-1 text-muted-foreground/70 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                aria-label="Clear search"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            ) : undefined
          }
        />
      </div>

      {/* Filter tabs */}
      <div
        role="tablist"
        aria-label="Annotation filters"
        className="flex gap-2 px-4 py-3 border-b border-border/30 sm:px-5"
      >
        {(["all", "active", "issues"] as const).map((f) => (
          <button
            key={f}
            type="button"
            role="tab"
            aria-selected={filter === f}
            onClick={() => setFilter(f)}
            className={cn(
              "px-3 py-1.5 text-xs font-semibold rounded-full transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
              filter === f
                ? "bg-surface-0 text-foreground border border-border/60 shadow-sm"
                : "text-muted-foreground border border-transparent hover:text-foreground hover:bg-surface-1/70"
            )}
          >
            {filterLabels[f]}
            {f === "issues" && issueCounts > 0 && (
              <span className="ml-1.5 px-1.5 py-0.5 text-[10px] bg-accent-rose text-white rounded-full">
                {issueCounts}
              </span>
            )}
          </button>
        ))}
      </div>

      <section
        aria-label="Annotation list"
        className="flex-1 overflow-y-auto px-4 py-4 outline-none sm:px-5"
        onKeyDown={handleKeyDown}
      >
        <ul ref={listRef} className="space-y-2.5">
          {filteredAnnotations.length === 0 ? (
            <li className="list-none">
              <AnnotationEmptyState />
            </li>
          ) : filter === "issues" && groupedAnnotations ? (
            // Render grouped sections for Issues tab
            issueStates.map((state) => {
              const group = groupedAnnotations[state];
              if (!group || group.length === 0) {
                return null;
              }
              return (
                <li key={state} className="space-y-2">
                  <h4
                    className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold px-1 pt-3 border-t border-border/40 first:border-t-0 first:pt-0"
                    data-issue-group={state}
                  >
                    {getIssueGroupLabel(state)} ({group.length})
                  </h4>
                  <ul className="space-y-2">
                    {group.map((annotation) => (
                      <li
                        key={annotation.id}
                        className={cn(
                          "rounded-md transition-colors",
                          focusedId === annotation.id && "ring-1 ring-primary/30 bg-surface-1/70"
                        )}
                        data-focused={focusedId === annotation.id}
                      >
                        <AnnotationListItem
                          annotation={annotation}
                          onSelect={(id) => {
                            setFocusedId(id);
                            onSelect(id);
                          }}
                          onDelete={onDelete}
                          onCopyLink={onCopyLink}
                          onScrollTo={onScrollTo}
                          isHovered={
                            hoveredAnnotationId === annotation.id || focusedId === annotation.id
                          }
                          onHover={onHover}
                          showActions
                          issueActions={issueActions}
                          isReadOnly={isReadOnly}
                        />
                      </li>
                    ))}
                  </ul>
                </li>
              );
            })
          ) : (
            // Flat list for All/Active tabs
            filteredAnnotations.map((annotation) => (
              <li
                key={annotation.id}
                className={cn(
                  "rounded-md transition-colors",
                  focusedId === annotation.id && "ring-1 ring-primary/30 bg-surface-1/70"
                )}
                data-focused={focusedId === annotation.id}
              >
                <AnnotationListItem
                  annotation={annotation}
                  onSelect={(id) => {
                    setFocusedId(id);
                    onSelect(id);
                  }}
                  onDelete={onDelete}
                  onCopyLink={onCopyLink}
                  onScrollTo={onScrollTo}
                  isHovered={hoveredAnnotationId === annotation.id || focusedId === annotation.id}
                  onHover={onHover}
                  showActions={filter === "issues"}
                  issueActions={issueActions}
                  isReadOnly={isReadOnly}
                />
              </li>
            ))
          )}
        </ul>
      </section>
    </section>
  );
}
