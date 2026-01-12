/**
 * FeedItemPreview - Linear-style article preview pane
 *
 * Displays the full content of a selected RSS item with polished styling,
 * entrance animation, and improved reading experience.
 */

"use client";

import { cn } from "@keepup/shared/utils";
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
import { useRssStore } from "../../lib/rss/useRssStore";

export interface FeedItemPreviewProps {
  itemId: string | null;
  onClose?: () => void;
  className?: string;
}

export function FeedItemPreview({ itemId, onClose, className }: FeedItemPreviewProps) {
  const { items, subscriptions, markAsRead, toggleSaved } = useRssStore();
  const { importFeedItem, isImporting } = useFeedItemImport();
  const contentRef = React.useRef<HTMLDivElement>(null);

  const item = React.useMemo(() => {
    if (!itemId) {
      return null;
    }
    return items.find((i) => i.id === itemId) ?? null;
  }, [items, itemId]);

  const subscription = React.useMemo(() => {
    if (!item) {
      return null;
    }
    return subscriptions.find((s) => s.id === item.subscriptionId) ?? null;
  }, [subscriptions, item]);

  // Mark as read when viewed
  React.useEffect(() => {
    if (item && item.readState === "unread") {
      markAsRead(item.id);
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
    if (item.url) {
      window.open(item.url, "_blank", "noopener,noreferrer");
    }
  };

  const handleOpenInEditor = async () => {
    if (item && subscription) {
      await importFeedItem(item.id, subscription.url ?? item.url);
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
      {/* Header */}
      <header className="flex items-center justify-between border-b border-border/10 px-4 py-3 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-xs font-medium text-muted-foreground truncate">
            {subscription?.displayName ?? subscription?.title ?? "Unknown Source"}
          </span>
          {item.readState === "read" && (
            <span className="flex items-center gap-1 text-[10px] text-muted-foreground/60 shrink-0">
              <Check className="h-3 w-3" />
              Read
            </span>
          )}
        </div>
        <div className="flex items-center gap-0.5 shrink-0">
          <button
            type="button"
            onClick={handleOpenInEditor}
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
            onClick={() => toggleSaved(item.id)}
            className={cn(
              "rounded-md p-2 transition-all duration-150",
              item.savedState
                ? "text-primary bg-primary/10 hover:bg-primary/15"
                : "text-muted-foreground hover:bg-surface-3 hover:text-foreground"
            )}
            title={item.savedState ? "Unsave" : "Save for later"}
            aria-label={item.savedState ? "Unsave article" : "Save article for later"}
          >
            <BookmarkIcon className={cn("h-4 w-4", item.savedState && "fill-current")} />
          </button>
          <button
            type="button"
            onClick={handleOpenOriginal}
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

      {/* Content */}
      <div ref={contentRef} className="flex-1 overflow-y-auto">
        <article className="p-6 max-w-2xl mx-auto">
          {/* Title */}
          <h1 className="mb-4 text-2xl font-semibold leading-tight text-foreground tracking-tight">
            {item.title}
          </h1>

          {/* Meta */}
          <div className="mb-6 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
            {item.author && (
              <span className="flex items-center gap-1.5">
                <User2 className="h-3.5 w-3.5" />
                {item.author}
              </span>
            )}
            {formattedDate && (
              <span className="flex items-center gap-1.5">
                <Calendar className="h-3.5 w-3.5" />
                {formattedDate}
              </span>
            )}
          </div>

          {/* Article Content */}
          <div
            className={cn(
              "prose prose-neutral dark:prose-invert max-w-none",
              // Enhanced typography
              "prose-headings:font-semibold prose-headings:tracking-tight",
              "prose-p:leading-relaxed prose-p:text-foreground/90",
              "prose-a:text-primary prose-a:no-underline hover:prose-a:underline",
              "prose-img:rounded-lg prose-img:shadow-md",
              "prose-code:text-sm prose-code:bg-surface-2 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded",
              "prose-blockquote:border-l-primary prose-blockquote:bg-surface-2/50 prose-blockquote:py-1 prose-blockquote:px-4 prose-blockquote:rounded-r-md"
            )}
            // biome-ignore lint/security/noDangerouslySetInnerHtml: RSS content
            dangerouslySetInnerHTML={{
              __html:
                item.contentHtml ??
                item.content ??
                "<p class='text-muted-foreground'>No content available</p>",
            }}
          />
        </article>
      </div>

      {/* Footer with original link */}
      <footer className="border-t border-border/10 px-4 py-3 shrink-0 bg-surface-1">
        <a
          href={item.url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 text-sm text-primary hover:underline transition-colors"
        >
          <ExternalLink className="h-3.5 w-3.5" />
          View original article
        </a>
      </footer>
    </div>
  );
}
