"use client";

/**
 * FeedsSidebarSection
 *
 * Renders the Feeds navigation within the main Sidebar.
 * Shows: Unread, Saved, All + dynamic subscription list with favicons.
 * Uses URL-based filtering via Next.js navigation.
 */

import { Link } from "@/i18n/navigation";
import { useRssStore } from "@/lib/rss";
import { cn } from "@/lib/utils";
import { Bookmark, Inbox, List, Plus, Rss } from "lucide-react";
import { useSearchParams } from "next/navigation";

interface FeedsSidebarSectionProps {
  onAddFeed?: () => void;
}

export function FeedsSidebarSection({ onAddFeed }: FeedsSidebarSectionProps) {
  const { subscriptions, items } = useRssStore();
  const searchParams = useSearchParams();
  const currentFilter = searchParams.get("filter") ?? "unread";

  // Compute counts
  const unreadCount = items.filter((i) => i.readState === "unread").length;
  const savedCount = items.filter((i) => i.savedState).length;

  const getUnreadCountForSub = (subId: string) => {
    return items.filter((i) => i.subscriptionId === subId && i.readState === "unread").length;
  };

  const staticFilters = [
    { id: "unread", label: "Unread", icon: Inbox, count: unreadCount },
    { id: "saved", label: "Saved", icon: Bookmark, count: savedCount },
    { id: "all", label: "All", icon: List, count: items.length },
  ];

  return (
    <div className="flex flex-col gap-0.5">
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
            const unread = getUnreadCountForSub(sub.id);
            const faviconUrl = sub.siteUrl
              ? `https://www.google.com/s2/favicons?domain=${new URL(sub.siteUrl).hostname}&sz=32`
              : null;

            return (
              <Link
                key={sub.id}
                href={`/feeds?filter=${sub.id}`}
                className={cn(
                  "group flex items-center gap-2 px-2 py-1.5 rounded-md text-sm transition-all duration-150",
                  currentFilter === sub.id
                    ? "bg-primary/10 text-primary font-medium"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground hover:translate-x-0.5"
                )}
                role="menuitem"
                data-value={sub.id}
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
