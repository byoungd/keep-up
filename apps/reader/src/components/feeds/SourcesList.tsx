/**
 * SourcesList - Sidebar list of feed sources
 */

"use client";

import { useRssStore } from "@/lib/rss";
import { cn } from "@keepup/shared/utils";
import { AlertCircle, Circle, Inbox, Plus, Rss, Star } from "lucide-react";
import * as React from "react";
import type { FeedFilter } from "./FeedList";

interface SourcesListProps {
  currentFilter: FeedFilter;
  onFilterChange: (filter: FeedFilter) => void;
  onAddFeed: () => void;
  className?: string;
}

export function SourcesList({
  currentFilter,
  onFilterChange,
  onAddFeed,
  className,
}: SourcesListProps) {
  const { subscriptions, items } = useRssStore();

  // Count unread items
  const unreadCount = React.useMemo(() => {
    return items.filter((i) => i.readState === "unread").length;
  }, [items]);

  const savedCount = React.useMemo(() => {
    return items.filter((i) => i.savedState).length;
  }, [items]);

  // Per-subscription unread counts
  const subUnreadCounts = React.useMemo(() => {
    const counts: Record<string, number> = {};
    for (const item of items) {
      if (item.readState === "unread") {
        counts[item.subscriptionId] = (counts[item.subscriptionId] || 0) + 1;
      }
    }
    return counts;
  }, [items]);

  return (
    <div className={cn("flex flex-col", className)}>
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2">
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          Sources
        </span>
        <button
          type="button"
          onClick={onAddFeed}
          className="p-1 rounded hover:bg-surface-2 text-muted-foreground hover:text-foreground transition-colors"
          title="Add feed"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Quick filters */}
      <div className="px-2 space-y-0.5">
        <SourceItem
          icon={<Inbox className="h-4 w-4" />}
          label="Unread"
          count={unreadCount}
          isActive={currentFilter === "unread"}
          onClick={() => onFilterChange("unread")}
        />
        <SourceItem
          icon={<Rss className="h-4 w-4" />}
          label="All Items"
          isActive={currentFilter === "all"}
          onClick={() => onFilterChange("all")}
        />
        <SourceItem
          icon={<Star className="h-4 w-4" />}
          label="Saved"
          count={savedCount > 0 ? savedCount : undefined}
          isActive={currentFilter === "saved"}
          onClick={() => onFilterChange("saved")}
        />
      </div>

      {/* Subscriptions */}
      {subscriptions.length > 0 && (
        <div className="mt-4 px-2 space-y-0.5">
          <div className="px-2 py-1.5 text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-wider">
            Feeds
          </div>
          {subscriptions.map((sub) => (
            <SourceItem
              key={sub.id}
              icon={
                sub.status === "error" ? (
                  <AlertCircle className="h-4 w-4 text-red-500" />
                ) : (
                  <Circle className="h-4 w-4" />
                )
              }
              label={sub.displayName || sub.title}
              count={subUnreadCounts[sub.id]}
              isActive={currentFilter === sub.id}
              onClick={() => onFilterChange(sub.id)}
            />
          ))}
        </div>
      )}

      {/* Empty state */}
      {subscriptions.length === 0 && (
        <div className="px-4 py-6 text-center">
          <Rss className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
          <p className="text-xs text-muted-foreground">No feeds yet</p>
          <button
            type="button"
            onClick={onAddFeed}
            className="mt-2 text-xs text-primary hover:underline"
          >
            Add your first feed
          </button>
        </div>
      )}
    </div>
  );
}

interface SourceItemProps {
  icon: React.ReactNode;
  label: string;
  count?: number;
  isActive?: boolean;
  onClick?: () => void;
}

function SourceItem({ icon, label, count, isActive, onClick }: SourceItemProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-left transition-colors",
        isActive
          ? "bg-primary/10 text-primary"
          : "text-muted-foreground hover:bg-surface-2 hover:text-foreground"
      )}
    >
      <span className="shrink-0">{icon}</span>
      <span className="flex-1 text-sm truncate">{label}</span>
      {count !== undefined && count > 0 && (
        <span
          className={cn(
            "text-[10px] font-medium px-1.5 py-0.5 rounded-full",
            isActive ? "bg-primary/20" : "bg-surface-2"
          )}
        >
          {count}
        </span>
      )}
    </button>
  );
}
