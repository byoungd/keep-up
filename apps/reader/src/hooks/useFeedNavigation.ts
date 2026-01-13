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
import { useFeedItems, useFeedProvider } from "@/providers/FeedProvider";
import type { FeedItemRow } from "@keepup/db";
import * as React from "react";

type FeedItem = FeedItemRow;

interface NavigationContext {
  filteredItems: FeedItem[];
  currentIndex: number;
  selectedItem: FeedItem | null;
}

interface NavigationActions {
  markAsRead: (id: string) => void;
  markAsUnread: (id: string) => void;
  toggleSaved: (id: string, currentSaved: boolean) => void;
  refreshAllFeeds: () => void;
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
      setSelectedItemId(filteredItems[currentIndex + 1].itemId);
    } else if (currentIndex === -1 && filteredItems.length > 0) {
      setSelectedItemId(filteredItems[0].itemId);
    }
    return true;
  }

  if (key === "k" || key === "ArrowUp") {
    if (currentIndex > 0) {
      setSelectedItemId(filteredItems[currentIndex - 1].itemId);
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

  if ((key === "o" || key === "Enter") && selectedItem?.link) {
    window.open(selectedItem.link, "_blank", "noopener,noreferrer");
    return true;
  }

  if (key === "m" && selectedItem) {
    if (selectedItem.readState === "unread") {
      actions.markAsRead(selectedItem.itemId);
    } else {
      actions.markAsUnread(selectedItem.itemId);
    }
    return true;
  }

  if (key === "s" && selectedItem) {
    actions.toggleSaved(selectedItem.itemId, selectedItem.saved);
    return true;
  }

  if (key === "r" && !actions.isLoading) {
    actions.refreshAllFeeds();
    return true;
  }

  return false;
}

export function useFeedNavigation(
  filter: FeedFilter,
  selectedItemId: string | null,
  setSelectedItemId: (id: string | null) => void
) {
  const { markAsRead, markAsUnread, toggleSaved, refreshAllFeeds, isLoading } = useFeedProvider();
  const { data: items = [] } = useFeedItems(filter);

  const getFilteredItems = React.useCallback((): FeedItem[] => {
    return items;
  }, [items]);

  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isInputElement(e.target)) {
        return;
      }

      const filteredItems = getFilteredItems();
      const currentIndex = selectedItemId
        ? filteredItems.findIndex((i) => i.itemId === selectedItemId)
        : -1;
      const selectedItem = selectedItemId
        ? (filteredItems.find((i) => i.itemId === selectedItemId) ?? null)
        : null;

      const ctx: NavigationContext = { filteredItems, currentIndex, selectedItem };
      const actions: NavigationActions = {
        markAsRead,
        markAsUnread,
        toggleSaved,
        refreshAllFeeds,
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
    refreshAllFeeds,
    isLoading,
  ]);
}
