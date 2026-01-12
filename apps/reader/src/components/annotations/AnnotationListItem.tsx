"use client";

import type { FocusEvent, KeyboardEvent, ReactElement } from "react";
import { useEffect, useState } from "react";

import { IssueBadge } from "@/components/annotations/IssueBadge";
import { IssueDetailsDrawer } from "@/components/annotations/IssueDetailsDrawer";
import {
  IssueActionButtons,
  type IssueActionHandlers,
} from "@/components/issues/IssueActionButtons";

import { Tooltip } from "@/components/ui/Tooltip";
import { type UIComment, useCommentStore } from "@/lib/annotations/commentStore";
import { formatDisplayState } from "@/lib/annotations/verification";
import { getIssueDefinitionForAnnotationState } from "@/lib/issues/issues";
import type { Annotation } from "@/lib/kernel/types";
import type { DisplayAnnoState } from "@keepup/core";
import { cn } from "@keepup/shared/utils";
import {
  ArrowUpRight,
  ChevronDown,
  ChevronRight,
  Link2,
  Loader2,
  MessageSquare,
  Send,
  Trash2,
} from "lucide-react";

const colorMap = {
  yellow: "bg-accent-amber/80",
  green: "bg-accent-emerald/80",
  red: "bg-accent-rose/80",
  purple: "bg-accent-violet/80",
};

const STATUS_TONE: Record<DisplayAnnoState, string> = {
  active: "bg-accent-emerald/12 text-accent-emerald dark:bg-accent-emerald/25",
  active_partial: "bg-accent-amber/12 text-accent-amber dark:bg-accent-amber/25",
  active_unverified: "bg-accent-indigo/12 text-accent-indigo dark:bg-accent-indigo/25",
  broken_grace: "bg-accent-rose/12 text-accent-rose dark:bg-accent-rose/25",
  orphan: "bg-surface-2/70 text-muted-foreground dark:bg-surface-2/40",
};

const DEFAULT_STATUS_TONE = "bg-surface-2/70 text-muted-foreground";

type ChainPolicy = NonNullable<Annotation["chain"]>["policy"];

function formatSpanLabel(spanCount?: number): string {
  if (spanCount == null) {
    return "n/a";
  }
  const suffix = spanCount === 1 ? "" : "s";
  return `${spanCount} span${suffix}`;
}

function formatPolicyLabel(chainPolicy?: ChainPolicy): string {
  if (!chainPolicy) {
    return "n/a";
  }
  return `${chainPolicy.kind} (${chainPolicy.maxInterveningBlocks})`;
}

function formatExcerpt(content: string): string {
  const normalized = content.replace(/\s+/g, " ").trim();
  if (normalized.length === 0) {
    return "Untitled annotation";
  }
  return `"${normalized}"`;
}

function formatVerifiedLabel(verified: boolean): string {
  return verified ? "verified" : "unverified";
}

function formatDateLabel(timestamp: number): string {
  return new Date(timestamp).toISOString().slice(0, 10);
}

function getRelativeTime(timestamp: number): string {
  const diff = Date.now() - timestamp;
  if (diff < 60000) {
    return "Just now";
  }
  if (diff < 3600000) {
    return `${Math.floor(diff / 60000)}m ago`;
  }
  if (diff < 86400000) {
    return `${Math.floor(diff / 3600000)}h ago`;
  }
  return formatDateLabel(timestamp);
}

function getInitials(name: string): string {
  return name.slice(0, 2).toUpperCase();
}

function formatCommentLabel(count: number): string {
  const suffix = count === 1 ? "" : "s";
  return `${count} note${suffix}`;
}

function renderToggleIcon(showComments: boolean): ReactElement {
  if (showComments) {
    return <ChevronDown className="h-3 w-3" />;
  }
  return <ChevronRight className="h-3 w-3" />;
}

function renderHelpBadge(helpMessage?: string): ReactElement | null {
  if (!helpMessage) {
    return null;
  }
  return (
    <Tooltip content={helpMessage} side="top">
      <span className="text-[10px] font-medium text-muted-foreground hover:text-foreground underline underline-offset-2">
        Why?
      </span>
    </Tooltip>
  );
}

function renderWarningBanner({
  issue,
  displayState,
  onScrollTo,
  annotationId,
  issueActions,
}: {
  issue: ReturnType<typeof getIssueDefinitionForAnnotationState>;
  displayState: DisplayAnnoState;
  onScrollTo?: (annotationId: string) => void;
  annotationId: string;
  issueActions?: IssueActionHandlers;
}): ReactElement | null {
  if (!issue || issue.severity === "info") {
    return null;
  }

  const canJump = Boolean(onScrollTo) && displayState !== "orphan";

  return (
    <div className="rounded-lg border border-accent-amber/30 bg-accent-amber/10 p-3 text-xs text-foreground/80">
      <div data-annotation-role="warning-banner" className="space-y-1">
        <p className="font-semibold flex items-center gap-1.5 mb-1">
          <span className="h-1.5 w-1.5 rounded-full bg-accent-amber inline-block" />
          Attention Needed
        </p>
        <p className="opacity-90 leading-relaxed">{issue.summary}</p>
        {canJump ? (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onScrollTo?.(annotationId);
            }}
            className="mt-1.5 text-[10px] font-medium underline decoration-accent-amber/30 hover:decoration-accent-amber/60 transition-all cursor-pointer"
          >
            Jump to available spans
          </button>
        ) : null}
        {issueActions ? (
          <IssueActionButtons issue={issue} handlers={issueActions} className="mt-2" />
        ) : null}
      </div>
    </div>
  );
}

function renderScrollAction({
  showActions,
  onScrollTo,
  annotationId,
}: {
  showActions?: boolean;
  onScrollTo?: (annotationId: string) => void;
  annotationId: string;
}): ReactElement | null {
  if (!showActions || !onScrollTo) {
    return null;
  }

  return (
    <button
      type="button"
      data-annotation-role="scroll-action"
      className="rounded-md p-1 text-muted-foreground/70 transition-colors hover:bg-primary/10 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      onClick={(event) => {
        event.stopPropagation();
        onScrollTo(annotationId);
      }}
      aria-label="Scroll to annotation"
    >
      <ArrowUpRight className="h-3.5 w-3.5" />
    </button>
  );
}

function renderCopyLinkAction({
  onCopyLink,
  annotationId,
}: {
  onCopyLink?: (annotationId: string) => void;
  annotationId: string;
}): ReactElement | null {
  if (!onCopyLink) {
    return null;
  }

  return (
    <button
      type="button"
      data-annotation-role="copy-link"
      className="rounded-md p-1 text-muted-foreground/70 transition-colors hover:bg-primary/10 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      onClick={(event) => {
        event.stopPropagation();
        onCopyLink(annotationId);
      }}
      aria-label="Copy annotation link"
    >
      <Link2 className="h-3.5 w-3.5" />
    </button>
  );
}

function AnnotationCommentsSection({
  showComments,
  issue,
  displayState,
  onScrollTo,
  annotationId,
  issueActions,
  isReadOnly,
  isIssueDismissed,
  comments,
  replyText,
  onReplyChange,
  onReplyKeyDown,
  onSubmitReply,
  onDeleteComment,
}: {
  showComments: boolean;
  issue: ReturnType<typeof getIssueDefinitionForAnnotationState>;
  displayState: DisplayAnnoState;
  onScrollTo?: (annotationId: string) => void;
  annotationId: string;
  issueActions?: IssueActionHandlers;
  isReadOnly?: boolean;
  isIssueDismissed?: boolean;
  comments: UIComment[];
  replyText: string;
  onReplyChange: (value: string) => void;
  onReplyKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
  onSubmitReply: () => void;
  onDeleteComment: (annotationId: string, commentId: string) => void;
}): ReactElement | null {
  if (!showComments) {
    return null;
  }

  return (
    <div className="mt-2 pl-4 space-y-3 transition-all relative">
      <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-border/40" />

      {!isIssueDismissed &&
        renderWarningBanner({ issue, displayState, onScrollTo, annotationId, issueActions })}

      {comments.length === 0 && <p className="text-xs text-muted-foreground">Add a note...</p>}

      {comments.map((comment) => (
        <div
          key={comment.id}
          className={cn("flex items-start gap-2.5 group/comment", comment.pending && "opacity-60")}
        >
          <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center shrink-0 border border-transparent group-hover/comment:border-primary/20 transition-colors">
            {comment.pending ? (
              <Loader2 className="h-3 w-3 text-primary animate-spin" />
            ) : (
              <span className="text-[10px] font-medium text-primary">
                {getInitials(comment.author)}
              </span>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-xs font-semibold text-foreground/90">{comment.author}</span>
              <span className="text-[10px] text-muted-foreground/60 tabular-nums">
                {comment.pending ? "Sending..." : getRelativeTime(comment.createdAt)}
              </span>
            </div>
            <p className="text-xs text-foreground/80 mt-0.5 leading-relaxed wrap-break-word whitespace-pre-wrap">
              {comment.text}
            </p>
            {!comment.pending && !isReadOnly && (
              <button
                type="button"
                onClick={() => onDeleteComment(annotationId, comment.id)}
                className="mt-1 text-[10px] text-destructive opacity-0 group-hover/comment:opacity-100 hover:underline transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive/30 focus-visible:ring-offset-2 focus-visible:ring-offset-background rounded"
                aria-label="Delete comment"
              >
                Delete
              </button>
            )}
          </div>
        </div>
      ))}

      <div className="flex items-start gap-2 pt-1">
        <textarea
          rows={2}
          value={replyText}
          onChange={(event) => onReplyChange(event.target.value)}
          onKeyDown={onReplyKeyDown}
          placeholder="Add a note..."
          disabled={isReadOnly}
          aria-label="Add a note"
          className="flex-1 resize-none px-3 py-2 text-xs rounded-md border border-border/60 bg-surface-0/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:ring-offset-2 focus-visible:ring-offset-background transition-shadow disabled:cursor-not-allowed disabled:opacity-60"
        />
        <button
          type="button"
          onClick={onSubmitReply}
          disabled={isReadOnly || !replyText.trim()}
          className="p-1.5 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:ring-offset-2 focus-visible:ring-offset-background shadow-sm"
          aria-label="Send reply"
        >
          <Send className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

// Stable empty array to avoid infinite re-render loop in Zustand selector
const EMPTY_COMMENTS: never[] = [];

export function AnnotationListItem({
  annotation,
  onSelect,
  onDelete,
  onCopyLink,
  onScrollTo,
  isHovered,
  onHover,
  showActions,
  issueActions,
  isReadOnly = false,
}: {
  annotation: Annotation;
  onSelect: (annotationId: string) => void;
  onDelete: (annotationId: string) => void;
  onCopyLink?: (annotationId: string) => void;
  onScrollTo?: (annotationId: string) => void;
  isHovered?: boolean;
  onHover?: (annotationId: string | null) => void;
  showActions?: boolean;
  issueActions?: IssueActionHandlers;
  isReadOnly?: boolean;
}) {
  const [showComments, setShowComments] = useState(false);
  const [replyText, setReplyText] = useState("");
  const [issueDismissed, setIssueDismissed] = useState(false);

  // Use stable selector to avoid infinite loop
  const commentsMap = useCommentStore((s) => s.comments);
  const comments = commentsMap[annotation.id] ?? EMPTY_COMMENTS;
  const addComment = useCommentStore((s) => s.addComment);
  const deleteComment = useCommentStore((s) => s.deleteComment);

  const spanLabel = formatSpanLabel(annotation.spans?.length);
  const policyLabel = formatPolicyLabel(annotation.chain?.policy);
  const shortId = annotation.id.slice(0, 8);
  const excerpt = formatExcerpt(annotation.content);
  const issue = getIssueDefinitionForAnnotationState(annotation.displayState);
  const helpMessage = issue?.summary;
  const statusToneClass = STATUS_TONE[annotation.displayState] ?? DEFAULT_STATUS_TONE;
  const helpBadge = renderHelpBadge(helpMessage);
  const commentLabel = formatCommentLabel(comments.length);
  const verifiedLabel = formatVerifiedLabel(annotation.verified);
  const toggleIcon = renderToggleIcon(showComments);
  const scrollAction = renderScrollAction({ showActions, onScrollTo, annotationId: annotation.id });
  const copyLinkAction = renderCopyLinkAction({ onCopyLink, annotationId: annotation.id });
  const issueBadge = <IssueBadge issue={issue} />;
  const showIssueDetails = Boolean(issue);
  const issueActionsWithDismiss = issueActions
    ? {
        ...issueActions,
        onDismiss: () => {
          issueActions.onDismiss?.();
          setIssueDismissed(true);
        },
      }
    : undefined;

  useEffect(() => {
    void annotation.displayState;
    void annotation.id;
    setIssueDismissed(false);
  }, [annotation.displayState, annotation.id]);

  const handleFocusCapture = () => onHover?.(annotation.id);
  const handleBlurCapture = (event: FocusEvent<HTMLDivElement>) => {
    const nextTarget = event.relatedTarget as Node | null;
    if (nextTarget && event.currentTarget.contains(nextTarget)) {
      return;
    }
    onHover?.(null);
  };

  const handleSubmitReply = () => {
    if (isReadOnly) {
      return;
    }
    if (replyText.trim()) {
      addComment(annotation.id, replyText);
      setReplyText("");
    }
  };

  const handleReplyKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (isReadOnly) {
      return;
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmitReply();
    }
  };

  const handleDeleteComment = (annotationId: string, commentId: string) => {
    if (isReadOnly) {
      return;
    }
    const shouldDelete = window.confirm("Delete this note? This cannot be undone.");
    if (!shouldDelete) {
      return;
    }
    deleteComment(annotationId, commentId);
  };

  return (
    <div
      onMouseEnter={() => onHover?.(annotation.id)}
      onMouseLeave={() => onHover?.(null)}
      onFocusCapture={handleFocusCapture}
      onBlurCapture={handleBlurCapture}
      className={cn(
        "group relative w-full cursor-pointer rounded-xl border border-border/60 bg-surface-0/95 shadow-sm transition-all",
        "hover:bg-surface-1/70 hover:border-border/80 hover:shadow-md focus-within:ring-2 focus-within:ring-primary/30 focus-within:ring-offset-2 focus-within:ring-offset-background",
        isHovered ? "bg-surface-1/80 shadow-md ring-1 ring-primary/15" : null
      )}
    >
      <div
        className={cn(
          "absolute left-0 top-4 bottom-4 w-1 rounded-r-full",
          colorMap[annotation.color ?? "yellow"]
        )}
      />

      <button
        type="button"
        data-annotation-role="panel-item"
        data-annotation-id={annotation.id}
        onClick={() => onSelect(annotation.id)}
        className="block w-full text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:ring-offset-2 focus-visible:ring-offset-background p-3 pr-8 rounded-xl"
      >
        <div className="pl-3 space-y-3">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold text-foreground">Annotation</span>
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 text-[10px] font-medium capitalize",
                  statusToneClass
                )}
              >
                {formatDisplayState(annotation.displayState)}
              </span>
              {issueBadge}
              {helpBadge}
            </div>
            <div className="text-[10px] font-mono text-muted-foreground" title={annotation.id}>
              ID: {shortId}
            </div>
          </div>
          <p className="text-sm leading-relaxed text-foreground/85 line-clamp-2">{excerpt}</p>
          <div className="flex flex-wrap items-center gap-2 text-[10px] text-muted-foreground/80">
            <span>{spanLabel}</span>
            <span className="h-1 w-1 rounded-full bg-muted-foreground/60" />
            <span>{policyLabel}</span>
            <span className="h-1 w-1 rounded-full bg-muted-foreground/60" />
            <span>{verifiedLabel}</span>
          </div>
        </div>
      </button>

      {showIssueDetails && (
        <div className="px-3 pb-2">
          <IssueDetailsDrawer issue={issue} actions={issueActionsWithDismiss} />
        </div>
      )}

      {/* Comments toggle */}
      <div className="px-3 pb-2">
        <button
          type="button"
          onClick={() => setShowComments(!showComments)}
          data-annotation-role="comment-toggle"
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:ring-offset-2 focus-visible:ring-offset-background rounded px-1"
        >
          {toggleIcon}
          <MessageSquare className="h-3 w-3" />
          <span>{commentLabel}</span>
        </button>

        {/* Comments section */}
        <AnnotationCommentsSection
          showComments={showComments}
          issue={issue}
          displayState={annotation.displayState}
          onScrollTo={onScrollTo}
          annotationId={annotation.id}
          issueActions={issueActionsWithDismiss}
          isReadOnly={isReadOnly}
          isIssueDismissed={issueDismissed}
          comments={comments}
          replyText={replyText}
          onReplyChange={(value) => setReplyText(value)}
          onReplyKeyDown={handleReplyKeyDown}
          onSubmitReply={handleSubmitReply}
          onDeleteComment={handleDeleteComment}
        />
      </div>

      <div className="absolute right-2 top-2 flex items-center gap-1">
        {scrollAction}
        {copyLinkAction}
        <button
          type="button"
          className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50"
          onClick={(event) => {
            event.stopPropagation();
            if (isReadOnly) {
              return;
            }
            onDelete(annotation.id);
          }}
          disabled={isReadOnly}
          aria-label="Delete annotation"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
