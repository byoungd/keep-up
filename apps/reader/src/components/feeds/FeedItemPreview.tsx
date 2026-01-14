/**
 * FeedItemPreview - Linear-style article preview pane
 *
 * Displays the full content of a selected RSS item with polished styling,
 * entrance animation, and improved reading experience.
 */

"use client";

import { type FeedSubscription, useFeedProvider } from "@/providers/FeedProvider";
import type { FeedItemRow } from "@ku0/db";
import { cn } from "@ku0/shared/utils";
import {
  BookmarkIcon,
  Calendar,
  Check,
  ExternalLink,
  FileEdit,
  Loader2,
  Rss,
  User2,
  X,
} from "lucide-react";
import * as React from "react";
import { useFeedItemImport } from "../../hooks/useFeedItemImport";

export interface FeedItemPreviewProps {
  item: FeedItemRow | null;
  onClose?: () => void;
  className?: string;
}

// Breakdown into smaller components to reduce complexity

function FeedItemPreviewHeader({
  item,
  subscription,
  isImporting,
  onImport,
  onToggleSaved,
  onOpenOriginal,
  onClose,
}: {
  item: FeedItemRow;
  subscription: FeedSubscription | null;
  isImporting: boolean;
  onImport: () => void;
  onToggleSaved: (id: string, saved: boolean) => void;
  onOpenOriginal: () => void;
  onClose?: () => void;
}) {
  return (
    <header className="flex items-center justify-between border-b border-border/5 px-6 py-4 shrink-0 bg-surface-1/50 backdrop-blur-sm sticky top-0 z-10 transition-all duration-200">
      <div className="flex items-center gap-3 min-w-0">
        <div className="flex flex-col min-w-0">
          <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider truncate">
            {subscription?.displayName ?? subscription?.title ?? "Unknown Source"}
          </span>
          {item.readState === "read" && (
            <span className="text-[10px] text-muted-foreground/50 flex items-center gap-1 mt-0.5">
              <Check className="h-2.5 w-2.5" /> Read
            </span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <button
          type="button"
          onClick={onImport}
          disabled={isImporting}
          className={cn(
            "rounded-md p-2 transition-colors",
            isImporting
              ? "text-primary bg-primary/10"
              : "text-muted-foreground hover:bg-surface-3 hover:text-foreground"
          )}
          title="Open in Editor"
          aria-label="Open article in editor"
        >
          {isImporting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <FileEdit className="h-4 w-4" />
          )}
        </button>
        <button
          type="button"
          onClick={() => onToggleSaved(item.itemId, item.saved)}
          className={cn(
            "rounded-md p-2 transition-all duration-200",
            item.saved
              ? "text-orange-500 bg-orange-500/10 hover:bg-orange-500/20"
              : "text-muted-foreground hover:bg-surface-3 hover:text-foreground"
          )}
          title={item.saved ? "Unsave" : "Save for later"}
          aria-label={item.saved ? "Unsave article" : "Save article for later"}
        >
          <BookmarkIcon className={cn("h-4 w-4", item.saved && "fill-current")} />
        </button>
        <div className="w-px h-4 bg-border/10 mx-1" />
        <button
          type="button"
          onClick={onOpenOriginal}
          className="rounded-md p-2 text-muted-foreground transition-colors hover:bg-surface-3 hover:text-foreground"
          title="Open original"
          aria-label="Open original article in new tab"
        >
          <ExternalLink className="h-4 w-4" />
        </button>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="ml-1 rounded-md p-2 text-muted-foreground transition-colors hover:bg-surface-3 hover:text-foreground"
            title="Close (Esc)"
            aria-label="Close preview panel"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
    </header>
  );
}

function FeedItemArticle({
  item,
  formattedDate,
}: { item: FeedItemRow; formattedDate: string | null }) {
  return (
    <article className="px-8 py-10 max-w-3xl mx-auto animate-in fade-in duration-500 slide-in-from-bottom-2">
      {/* Title */}
      <h1 className="mb-4 text-3xl font-bold leading-tight text-foreground tracking-tight">
        {item.title}
      </h1>

      {/* Meta */}
      <div className="mb-8 flex flex-wrap items-center gap-4 text-xs text-muted-foreground font-medium border-b border-border/5 pb-6">
        {item.author && (
          <span className="flex items-center gap-1.5">
            <User2 className="h-3.5 w-3.5 opacity-70" />
            {item.author}
          </span>
        )}
        {formattedDate && (
          <span className="flex items-center gap-1.5">
            <Calendar className="h-3.5 w-3.5 opacity-70" />
            {formattedDate}
          </span>
        )}
      </div>

      {/* Article Content */}
      <div
        className={cn(
          "prose prose-neutral dark:prose-invert max-w-none",
          // Enhanced typography for readability
          "prose-p:leading-7 prose-p:text-[15px] prose-p:text-foreground/80 lowercase-nums",
          "prose-headings:font-semibold prose-headings:tracking-tight prose-headings:text-foreground",
          "prose-a:text-primary prose-a:font-medium prose-a:no-underline hover:prose-a:underline hover:prose-a:decoration-primary/30",
          "prose-strong:font-semibold prose-strong:text-foreground",
          "prose-code:text-[13px] prose-code:bg-surface-2 prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:font-mono",
          "prose-pre:bg-surface-2 prose-pre:border prose-pre:border-border/5 prose-pre:rounded-lg",
          "prose-img:rounded-lg prose-img:shadow-sm prose-img:border prose-img:border-border/5",
          "prose-blockquote:border-l-2 prose-blockquote:border-primary/40 prose-blockquote:bg-surface-2/20 prose-blockquote:py-2 prose-blockquote:px-5 prose-blockquote:rounded-r-lg prose-blockquote:italic"
        )}
        // biome-ignore lint/security/noDangerouslySetInnerHtml: RSS content
        dangerouslySetInnerHTML={{
          __html:
            item.contentHtml ??
            item.excerpt ??
            "<div class='flex flex-col items-center justify-center py-10 text-muted-foreground italic'><p>No content available for this article.</p></div>",
        }}
      />
    </article>
  );
}

export function FeedItemPreview({ item, onClose, className }: FeedItemPreviewProps) {
  const { subscriptions, markAsRead, toggleSaved } = useFeedProvider();
  const { importFeedItem, isImporting } = useFeedItemImport();
  const contentRef = React.useRef<HTMLDivElement>(null);

  const itemId = item?.itemId;

  const subscription = React.useMemo(() => {
    if (!item) {
      return null;
    }
    return subscriptions.find((s) => s.subscriptionId === item.subscriptionId) ?? null;
  }, [subscriptions, item]);

  // Mark as read when viewed
  React.useEffect(() => {
    if (item && item.readState === "unread") {
      markAsRead(item.itemId);
    }
  }, [item, markAsRead]);

  // Scroll to top when item changes
  // biome-ignore lint/correctness/useExhaustiveDependencies: itemId triggers scroll reset intentionally
  React.useEffect(() => {
    if (contentRef.current) {
      contentRef.current.scrollTop = 0;
    }
  }, [itemId]);

  if (!itemId || !item) {
    return (
      <div className={cn("flex h-full w-full items-center justify-center bg-surface-1", className)}>
        <div className="flex flex-col items-center gap-4 text-center p-8">
          <div className="w-20 h-20 rounded-full bg-linear-to-br from-muted/40 to-muted/20 flex items-center justify-center">
            <Rss className="h-10 w-10 text-muted-foreground/30" />
          </div>
          <div>
            <h3 className="text-lg font-medium text-foreground mb-1">Select an article</h3>
            <p className="text-sm text-muted-foreground max-w-50">
              Choose an article from the list to read it here
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground/60 mt-2">
            <kbd className="px-1.5 py-0.5 rounded bg-surface-2 font-mono">j</kbd>
            <span>/</span>
            <kbd className="px-1.5 py-0.5 rounded bg-surface-2 font-mono">k</kbd>
            <span>to navigate</span>
          </div>
        </div>
      </div>
    );
  }

  const formattedDate = item.publishedAt
    ? new Date(item.publishedAt).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;

  const handleOpenOriginal = () => {
    if (item.link) {
      window.open(item.link, "_blank", "noopener,noreferrer");
    }
  };

  const handleOpenInEditor = async () => {
    if (item && subscription) {
      await importFeedItem(item.itemId, subscription.url ?? item.link ?? "");
    }
  };

  return (
    <div
      className={cn(
        "flex h-full flex-col bg-surface-1",
        "animate-in slide-in-from-right-2 duration-200 fade-in-0",
        className
      )}
    >
      <FeedItemPreviewHeader
        item={item}
        subscription={subscription}
        isImporting={isImporting}
        onImport={handleOpenInEditor}
        onToggleSaved={toggleSaved}
        onOpenOriginal={handleOpenOriginal}
        onClose={onClose}
      />

      <div
        ref={contentRef}
        className="flex-1 overflow-y-auto selection:bg-primary/20 selection:text-foreground"
      >
        <FeedItemArticle item={item} formattedDate={formattedDate} />
      </div>

      <footer className="border-t border-border/10 px-6 py-3 shrink-0 bg-surface-1/50 backdrop-blur-sm text-xs text-muted-foreground flex justify-between items-center">
        <a
          href={item.link ?? "#"}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-primary hover:underline transition-colors font-medium"
        >
          <ExternalLink className="h-3 w-3" />
          View Original
        </a>
        <span>
          ID: <span className="font-mono opacity-50">{item.itemId.slice(0, 8)}</span>
        </span>
      </footer>
    </div>
  );
}
