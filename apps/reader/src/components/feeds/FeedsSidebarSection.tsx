"use client";

/**
 * FeedsSidebarSection
 *
 * Renders the Feeds navigation within the main Sidebar.
 * Shows: Unread, Saved, All + dynamic subscription list with favicons.
 * Uses URL-based filtering via Next.js navigation.
 */

import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import { useFeedProvider } from "@/providers/FeedProvider";
import { Bookmark, Inbox, List, Plus, Rss } from "lucide-react";
import { useSearchParams } from "next/navigation";
import * as React from "react";
import { TopicManagementModal } from "./TopicManagementModal";

interface FeedsSidebarSectionProps {
  onAddFeed?: () => void;
}

export function FeedsSidebarSection({ onAddFeed }: FeedsSidebarSectionProps) {
  const { subscriptions, items, topics } = useFeedProvider();
  const searchParams = useSearchParams();
  const currentFilter = searchParams.get("filter") ?? "unread";

  const [isTopicModalOpen, setIsTopicModalOpen] = React.useState(false);
  const [editingTopic, setEditingTopic] = React.useState<import("@keepup/db").TopicRow | undefined>(
    undefined
  );

  // Compute counts
  const unreadCount = React.useMemo(
    () => subscriptions.reduce((acc, sub) => acc + (sub.unreadCount ?? 0), 0),
    [subscriptions]
  );
  const savedCount = React.useMemo(() => items.filter((i) => i.saved).length, [items]);
  const totalCount = items.length;

  const unreadCountBySub = React.useMemo(() => {
    const map = new Map<string, number>();
    for (const sub of subscriptions) {
      map.set(sub.subscriptionId, sub.unreadCount ?? 0);
    }
    return map;
  }, [subscriptions]);

  const getUnreadCountForSub = (subId: string) => unreadCountBySub.get(subId) ?? 0;

  const staticFilters = [
    { id: "unread", label: "Unread", icon: Inbox, count: unreadCount },
    { id: "saved", label: "Saved", icon: Bookmark, count: savedCount },
    { id: "all", label: "All", icon: List, count: totalCount },
  ];

  const handleCreateTopic = () => {
    setEditingTopic(undefined);
    setIsTopicModalOpen(true);
  };

  const handleEditTopic = (e: React.MouseEvent, topic: import("@keepup/db").TopicRow) => {
    e.preventDefault();
    e.stopPropagation();
    setEditingTopic(topic);
    setIsTopicModalOpen(true);
  };

  return (
    <div className="flex flex-col gap-0.5">
      <TopicManagementModal
        open={isTopicModalOpen}
        onClose={() => setIsTopicModalOpen(false)}
        topic={editingTopic}
      />

      {/* Static filters */}
      {staticFilters.map((filter) => (
        <Link
          key={filter.id}
          href={`/feeds?filter=${filter.id}`}
          className={cn(
            "group flex items-center gap-2 px-2 py-1.5 rounded-md text-sm transition-all duration-150",
            currentFilter === filter.id
              ? "bg-primary/10 text-primary font-medium"
              : "text-muted-foreground hover:bg-muted hover:text-foreground hover:translate-x-0.5"
          )}
          role="menuitem"
          data-value={filter.id}
        >
          <filter.icon className="h-4 w-4 shrink-0" />
          <span className="flex-1 truncate">{filter.label}</span>
          {filter.count > 0 && (
            <span
              className={cn(
                "text-[10px] font-medium px-1.5 py-0.5 rounded-full tabular-nums",
                currentFilter === filter.id
                  ? "bg-primary/20 text-primary"
                  : "bg-surface-2 text-muted-foreground"
              )}
            >
              {filter.count}
            </span>
          )}
        </Link>
      ))}

      {/* Topics Section */}
      <div className="flex items-center justify-between px-2 pt-3 pb-1 group/header">
        <span className="text-[10px] font-semibold text-muted-foreground/70 uppercase tracking-wider">
          Topics
        </span>
        <button
          type="button"
          onClick={handleCreateTopic}
          className="opacity-0 group-hover/header:opacity-100 transition-all duration-200 p-0.5 hover:bg-surface-3 rounded-md text-muted-foreground hover:text-foreground"
          title="Create Topic"
          aria-label="Create Topic"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      </div>

      {topics.map((topic) => (
        <div key={topic.topicId} className="group relative">
          <Link
            href={`/feeds?filter=topic:${topic.topicId}`}
            className={cn(
              "flex items-center gap-2 px-2 py-1.5 rounded-md text-sm transition-all duration-150 w-full",
              currentFilter === `topic:${topic.topicId}`
                ? "bg-primary/10 text-primary font-medium"
                : "text-muted-foreground hover:bg-muted hover:text-foreground hover:translate-x-0.5"
            )}
            role="menuitem"
          >
            <span
              className="h-2.5 w-2.5 rounded-full shrink-0"
              style={{ backgroundColor: topic.color || "currentColor" }}
            />
            <span className="flex-1 truncate">{topic.name}</span>

            {/* Quick Actions (Edit) */}
            <button
              type="button"
              onClick={(e) => handleEditTopic(e, topic)}
              className="opacity-0 group-hover:opacity-100 p-1 hover:bg-surface-3 rounded-md transition-all duration-200 text-muted-foreground hover:text-foreground"
              title="Edit Topic"
              aria-label="Edit Topic"
            >
              <span className="sr-only">Edit</span>
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="lucide lucide-more-horizontal"
              >
                <title>Edit Topic</title>
                <circle cx="12" cy="12" r="1" />
                <circle cx="19" cy="12" r="1" />
                <circle cx="5" cy="12" r="1" />
              </svg>
            </button>
          </Link>
        </div>
      ))}

      {/* Subscriptions section */}
      {subscriptions.length > 0 && (
        <>
          <div className="flex items-center gap-2 px-2 pt-3 pb-1">
            <span className="text-[10px] font-semibold text-muted-foreground/70 uppercase tracking-wider">
              Subscriptions
            </span>
            <div className="flex-1 h-px bg-border/30" />
          </div>

          {/* Dynamic subscription items */}
          {subscriptions.map((sub) => {
            const unread = getUnreadCountForSub(sub.subscriptionId);
            const faviconUrl = sub.siteUrl
              ? `https://www.google.com/s2/favicons?domain=${new URL(sub.siteUrl).hostname}&sz=32`
              : null;

            return (
              <Link
                key={sub.subscriptionId}
                href={`/feeds?filter=${sub.subscriptionId}`}
                className={cn(
                  "group flex items-center gap-2 px-2 py-1.5 rounded-md text-sm transition-all duration-150",
                  currentFilter === sub.subscriptionId
                    ? "bg-primary/10 text-primary font-medium"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground hover:translate-x-0.5"
                )}
                role="menuitem"
                data-value={sub.subscriptionId}
              >
                {/* Favicon or fallback icon */}
                {faviconUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={faviconUrl}
                    alt=""
                    className="h-4 w-4 rounded-sm shrink-0"
                    onError={(e) => {
                      e.currentTarget.style.display = "none";
                      e.currentTarget.nextElementSibling?.classList.remove("hidden");
                    }}
                  />
                ) : null}
                <Rss
                  className={cn("h-4 w-4 text-orange-500/80 shrink-0", faviconUrl && "hidden")}
                />

                <span className="flex-1 truncate">{sub.displayName || sub.title}</span>

                {/* Unread badge with animation */}
                {unread > 0 && (
                  <span className="relative flex h-2 w-2 shrink-0">
                    <span className="absolute inline-flex h-full w-full rounded-full bg-primary opacity-30 animate-ping" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
                  </span>
                )}
              </Link>
            );
          })}
        </>
      )}

      {/* Add feed button */}
      <button
        type="button"
        onClick={onAddFeed}
        className={cn(
          "flex items-center gap-2 px-2 py-1.5 rounded-md text-sm transition-all duration-150 mt-1",
          "text-muted-foreground/70 hover:bg-muted hover:text-foreground hover:translate-x-0.5"
        )}
        role="menuitem"
        data-value="add-feed"
      >
        <Plus className="h-4 w-4" />
        <span>Add feed</span>
      </button>
    </div>
  );
}
