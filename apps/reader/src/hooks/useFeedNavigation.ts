/**
 * useFeedNavigation Hook
 *
 * Handles keyboard navigation and actions for the feed list.
 * Shortcuts:
 * - j/↓: Next item
 * - k/↑: Previous item
 * - m: Toggle read/unread
 * - s: Toggle saved
 * - o/Enter: Open original
 * - Escape: Deselect
 */

import type { FeedFilter } from "@/components/feeds";
import { useRssStore } from "@/lib/rss";
import * as React from "react";

interface FeedItem {
  id: string;
  url?: string;
  readState: "unread" | "read";
  savedState: boolean;
  subscriptionId: string;
}

interface NavigationContext {
  filteredItems: FeedItem[];
  currentIndex: number;
  selectedItem: FeedItem | null;
}

interface NavigationActions {
  markAsRead: (id: string) => void;
  markAsUnread: (id: string) => void;
  toggleSaved: (id: string) => void;
  syncAllFeeds: () => void;
  isLoading: boolean;
}

/** Check if event target is an input element */
function isInputElement(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  return (
    el instanceof HTMLInputElement ||
    el instanceof HTMLTextAreaElement ||
    Boolean(el?.isContentEditable) ||
    Boolean(el?.closest(".ProseMirror"))
  );
}

/** Handle navigation keys (j/k/arrows) */
function handleNavigationKey(
  key: string,
  ctx: NavigationContext,
  setSelectedItemId: (id: string | null) => void
): boolean {
  const { filteredItems, currentIndex } = ctx;

  if (key === "j" || key === "ArrowDown") {
    if (currentIndex < filteredItems.length - 1) {
      setSelectedItemId(filteredItems[currentIndex + 1].id);
    } else if (currentIndex === -1 && filteredItems.length > 0) {
      setSelectedItemId(filteredItems[0].id);
    }
    return true;
  }

  if (key === "k" || key === "ArrowUp") {
    if (currentIndex > 0) {
      setSelectedItemId(filteredItems[currentIndex - 1].id);
    }
    return true;
  }

  if (key === "Escape") {
    setSelectedItemId(null);
    return true;
  }

  return false;
}

/** Handle action keys (o/Enter/m/s/r) */
function handleActionKey(key: string, ctx: NavigationContext, actions: NavigationActions): boolean {
  const { selectedItem } = ctx;

  if ((key === "o" || key === "Enter") && selectedItem?.url) {
    window.open(selectedItem.url, "_blank", "noopener,noreferrer");
    return true;
  }

  if (key === "m" && selectedItem) {
    if (selectedItem.readState === "unread") {
      actions.markAsRead(selectedItem.id);
    } else {
      actions.markAsUnread(selectedItem.id);
    }
    return true;
  }

  if (key === "s" && selectedItem) {
    actions.toggleSaved(selectedItem.id);
    return true;
  }

  if (key === "r" && !actions.isLoading) {
    actions.syncAllFeeds();
    return true;
  }

  return false;
}

export function useFeedNavigation(
  filter: FeedFilter,
  selectedItemId: string | null,
  setSelectedItemId: (id: string | null) => void
) {
  const { items, markAsRead, markAsUnread, toggleSaved, syncAllFeeds, isLoading } = useRssStore();

  const getFilteredItems = React.useCallback((): FeedItem[] => {
    return items.filter((item) => {
      if (filter === "unread") {
        return item.readState === "unread";
      }
      if (filter === "saved") {
        return item.savedState;
      }
      if (filter === "all") {
        return true;
      }
      return item.subscriptionId === filter;
    });
  }, [filter, items]);

  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isInputElement(e.target)) {
        return;
      }

      const filteredItems = getFilteredItems();
      const currentIndex = selectedItemId
        ? filteredItems.findIndex((i) => i.id === selectedItemId)
        : -1;
      const selectedItem = selectedItemId
        ? (filteredItems.find((i) => i.id === selectedItemId) ?? null)
        : null;

      const ctx: NavigationContext = { filteredItems, currentIndex, selectedItem };
      const actions: NavigationActions = {
        markAsRead,
        markAsUnread,
        toggleSaved,
        syncAllFeeds,
        isLoading,
      };

      const handled =
        handleNavigationKey(e.key, ctx, setSelectedItemId) || handleActionKey(e.key, ctx, actions);

      if (handled) {
        e.preventDefault();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    selectedItemId,
    setSelectedItemId,
    getFilteredItems,
    markAsRead,
    markAsUnread,
    toggleSaved,
    syncAllFeeds,
    isLoading,
  ]);
}
