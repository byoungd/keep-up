/**
 * FeedListHeader - Toolbar for feed list with bulk actions
 *
 * Provides filter label and bulk action buttons (Mark all as read, refresh).
 */

"use client";

import { useFeedProvider } from "@/providers/FeedProvider";
import { cn } from "@keepup/shared/utils";
import { Check, Plus, RefreshCw } from "lucide-react";
import * as React from "react";
import type { FeedFilter } from "./FeedList";

export interface FeedListHeaderProps {
  filter: FeedFilter;
  onAddFeed?: () => void;
  className?: string;
}

export function FeedListHeader({ filter, onAddFeed, className }: FeedListHeaderProps) {
  const { markAllAsRead, refreshAllFeeds, isLoading, subscriptions } = useFeedProvider();

  const unreadCount = React.useMemo(() => {
    // We don't have all items here easily without fetching them.
    // FeedProvider provides subscriptions with unread counts.
    // So for "all" or "unread", we can sum subscription unread counts.
    if (!subscriptions) return 0;
    return subscriptions.reduce((acc, sub) => acc + (sub.unreadCount || 0), 0);
  }, [subscriptions]);

  const handleMarkAllRead = async () => {
    if (filter === "all" || filter === "unread") {
      // Mark all in all enabled subs? Or simple batch?
      // Since FeedProvider has markAllAsRead(subId), we might need to iterate or add markGlobalAsRead.
      // For now, iterate subscriptions with unread items.
      const promises = subscriptions
        .filter((s) => (s.unreadCount || 0) > 0)
        .map((s) => markAllAsRead(s.subscriptionId));
      await Promise.all(promises);
    } else if (filter !== "saved") {
      // Filter is a subscription ID
      await markAllAsRead(filter);
    }
  };

  const handleRefresh = async () => {
    await refreshAllFeeds();
  };

  const getFilterLabel = () => {
    switch (filter) {
      case "unread":
        return "Unread";
      case "all":
        return "All Articles";
      case "saved":
        return "Saved";
      default: {
        // Try to find subscription name if it's an ID
        const sub = subscriptions?.find((s) => s.subscriptionId === filter);
        return sub?.displayName || sub?.title || "Feed";
      }
    }
  };

  return (
    <header
      className={cn(
        "flex items-center justify-between px-4 py-2 border-b border-border/5 h-[41px] shrink-0 bg-surface-1/50 backdrop-blur-sm sticky top-0 z-20",
        className
      )}
    >
      <div className="flex items-center gap-2">
        <h1 className="text-[13px] font-medium text-foreground">{getFilterLabel()}</h1>
        {unreadCount > 0 && filter === "unread" && (
          <span className="text-[10px] text-muted-foreground font-mono opacity-60">
            {unreadCount}
          </span>
        )}
      </div>

      <div className="flex items-center gap-1">
        {/* Add Feed Button */}
        {onAddFeed && (
          <button
            type="button"
            onClick={onAddFeed}
            className="flex items-center gap-1.5 px-2 py-1 text-[11px] text-primary hover:bg-primary/10 rounded ml-1 transition-colors font-medium opacity-80 hover:opacity-100"
            title="Add new feed"
          >
            <Plus className="h-3 w-3" />
            <span className="hidden sm:inline">Add Feed</span>
          </button>
        )}

        {/* Mark all as read button */}
        {filter !== "saved" && unreadCount > 0 && (
          <button
            type="button"
            onClick={handleMarkAllRead}
            className="flex items-center gap-1.5 px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground hover:bg-surface-2 rounded transition-colors"
            title="Mark all as read"
            aria-label="Mark all articles as read"
          >
            <Check className="h-3 w-3" />
            <span className="hidden sm:inline">Mark read</span>
          </button>
        )}

        {/* Refresh button */}
        <button
          type="button"
          onClick={handleRefresh}
          disabled={isLoading}
          className={cn(
            "flex items-center gap-1.5 px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground hover:bg-surface-2 rounded transition-colors",
            isLoading && "opacity-50 cursor-not-allowed"
          )}
          title="Refresh all feeds"
          aria-label={isLoading ? "Syncing feeds" : "Refresh all feeds"}
        >
          <RefreshCw className={cn("h-3 w-3", isLoading && "animate-spin")} />
        </button>
      </div>
    </header>
  );
}
