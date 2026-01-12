/**
 * FeedListHeader - Toolbar for feed list with bulk actions
 *
 * Provides filter label and bulk action buttons (Mark all as read, refresh).
 */

"use client";

import { useRssStore } from "@/lib/rss";
import { cn } from "@keepup/shared/utils";
import { Check, RefreshCw } from "lucide-react";
import * as React from "react";
import type { FeedFilter } from "./FeedList";

export interface FeedListHeaderProps {
  filter: FeedFilter;
  className?: string;
}

export function FeedListHeader({ filter, className }: FeedListHeaderProps) {
  const { markAllAsRead, syncAllFeeds, isLoading, items } = useRssStore();

  const unreadCount = React.useMemo(() => {
    return items.filter((i) => i.readState === "unread").length;
  }, [items]);

  const handleMarkAllRead = () => {
    if (filter === "all" || filter === "unread") {
      markAllAsRead();
    } else if (filter !== "saved") {
      // Filter is a subscription ID
      markAllAsRead(filter);
    }
  };

  const handleRefresh = async () => {
    await syncAllFeeds();
  };

  const getFilterLabel = () => {
    switch (filter) {
      case "unread":
        return `Unread${unreadCount > 0 ? ` (${unreadCount})` : ""}`;
      case "all":
        return "All Items";
      case "saved":
        return "Saved";
      default:
        return "Feed";
    }
  };

  return (
    <header
      className={cn(
        "flex items-center justify-between px-4 py-3 border-b border-border/10",
        className
      )}
    >
      <h1 className="text-sm font-medium">{getFilterLabel()}</h1>

      <div className="flex items-center gap-1">
        {/* Mark all as read button */}
        {filter !== "saved" && unreadCount > 0 && (
          <button
            type="button"
            onClick={handleMarkAllRead}
            className="flex items-center gap-1.5 px-2 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-surface-2 rounded-md transition-colors"
            title="Mark all as read"
            aria-label="Mark all articles as read"
          >
            <Check className="h-3 w-3" />
            <span className="hidden sm:inline">Mark all read</span>
          </button>
        )}

        {/* Refresh button */}
        <button
          type="button"
          onClick={handleRefresh}
          disabled={isLoading}
          className={cn(
            "flex items-center gap-1.5 px-2 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-surface-2 rounded-md transition-colors",
            isLoading && "opacity-50 cursor-not-allowed"
          )}
          title="Refresh all feeds"
          aria-label={isLoading ? "Syncing feeds" : "Refresh all feeds"}
        >
          <RefreshCw className={cn("h-3 w-3", isLoading && "animate-spin")} />
          <span className="hidden sm:inline">{isLoading ? "Syncing..." : "Refresh"}</span>
        </button>
      </div>
    </header>
  );
}
