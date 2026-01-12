"use client";

import { useRssFeeds } from "@/hooks/useRssFeeds";
import type { RssFolder, RssSubscription, RssSubscriptionRow } from "@keepup/db";
import { createFolder, deleteFolder, getUnreadCount, updateFolder } from "@keepup/db";
import { cn } from "@keepup/shared/utils";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  Bookmark,
  Check,
  ChevronDown,
  ChevronRight,
  Edit2,
  Folder,
  MoreHorizontal,
  Plus,
  Rss,
  Trash2,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo, useRef, useState } from "react";
import { FeedListSkeleton } from "../ui/skeletons";
import { FeedItemRow } from "./FeedItemRow";

export type FeedFilter = "unread" | "all" | "saved" | string;

interface FeedListManagementProps {
  subscriptions: RssSubscription[];
  folders: RssFolder[];
  onEditSubscription: (sub: RssSubscription) => void;
  onDeleteSubscription: (id: string) => void;
  onToggleSubscriptionEnabled: (id: string, enabled: boolean) => void;
  onRefresh: () => void;
}

interface FeedListItemsProps {
  filter: FeedFilter;
  onItemClick: (itemId: string) => void;
  className?: string;
  activeItemId?: string | null;
}

type FeedListProps = FeedListManagementProps | FeedListItemsProps;

export function FeedList(props: FeedListProps) {
  if ("filter" in props) {
    return <FeedItemsList {...props} />;
  }

  return <FeedManagementList {...props} />;
}

function FeedManagementList({
  subscriptions,
  folders,
  onEditSubscription,
  onDeleteSubscription,
  onToggleSubscriptionEnabled,
  onRefresh,
}: FeedListManagementProps) {
  const t = useTranslations("Feeds");
  const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>({});
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [editingFolderId, setEditingFolderId] = useState<string | null>(null);
  const [editFolderName, setEditFolderName] = useState("");

  // Group subscriptions by folder
  const { folderMap, unorganizedSubs } = useMemo(() => {
    const map: Record<string, RssSubscription[]> = {};
    const unorganized: RssSubscription[] = [];

    for (const sub of subscriptions) {
      if (sub.folderId) {
        if (!map[sub.folderId]) {
          map[sub.folderId] = [];
        }
        map[sub.folderId].push(sub);
      } else {
        unorganized.push(sub);
      }
    }

    return { folderMap: map, unorganizedSubs: unorganized };
  }, [subscriptions]);

  const toggleFolder = (folderId: string) => {
    setExpandedFolders((prev) => ({
      ...prev,
      [folderId]: !prev[folderId],
    }));
  };

  const handleCreateFolder = () => {
    if (newFolderName.trim()) {
      createFolder({ name: newFolderName.trim() });
      setNewFolderName("");
      setIsCreatingFolder(false);
      onRefresh();
    }
  };

  const handleUpdateFolder = () => {
    if (editingFolderId && editFolderName.trim()) {
      updateFolder(editingFolderId, { name: editFolderName.trim() });
      setEditingFolderId(null);
      setEditFolderName("");
      onRefresh();
    }
  };

  const handleDeleteFolder = (folderId: string) => {
    if (confirm(t("confirmDeleteFolder"))) {
      deleteFolder(folderId);
      onRefresh();
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between px-2">
        <h3 className="text-sm font-medium text-muted-foreground">{t("yourFeeds")}</h3>
        <button
          type="button"
          onClick={() => setIsCreatingFolder(true)}
          className="text-xs flex items-center gap-1 text-primary hover:text-primary/80"
        >
          <Plus className="w-3 h-3" />
          {t("newFolder")}
        </button>
      </div>

      {/* New Folder Input */}
      {isCreatingFolder && (
        <div className="flex items-center gap-2 px-2 py-1">
          <Folder className="w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                handleCreateFolder();
              }
              if (e.key === "Escape") {
                setIsCreatingFolder(false);
              }
            }}
            placeholder={t("folderNamePlaceholder")}
            className="flex-1 text-sm bg-transparent border-b border-primary focus:outline-none"
          />
          <div className="text-[10px] text-muted-foreground">↵ to save</div>
        </div>
      )}

      <div className="space-y-1">
        {/* Folders */}
        {folders.map((folder) => {
          const folderSubs = folderMap[folder.folderId] || [];
          const isExpanded = expandedFolders[folder.folderId] ?? true;
          const isEditing = editingFolderId === folder.folderId;

          return (
            <div key={folder.folderId} className="group/folder">
              {/* Folder Header */}
              <div
                className={cn(
                  "flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-muted/50 select-none",
                  "text-sm font-medium"
                )}
              >
                {isEditing ? (
                  <input
                    type="text"
                    value={editFolderName}
                    onChange={(e) => setEditFolderName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        handleUpdateFolder();
                      }
                      if (e.key === "Escape") {
                        setEditingFolderId(null);
                      }
                    }}
                    onBlur={handleUpdateFolder}
                    onClick={(e) => e.stopPropagation()}
                    className="flex-1 bg-transparent border-b border-primary focus:outline-none"
                  />
                ) : (
                  <>
                    <button
                      type="button"
                      className="flex items-center gap-2 flex-1 text-left"
                      onClick={() => toggleFolder(folder.folderId)}
                      aria-expanded={isExpanded}
                    >
                      <span className="text-muted-foreground hover:text-foreground">
                        {isExpanded ? (
                          <ChevronDown className="w-4 h-4" />
                        ) : (
                          <ChevronRight className="w-4 h-4" />
                        )}
                      </span>
                      <Folder className="w-4 h-4 text-blue-500/80" />
                      <span className="flex-1 truncate">{folder.name}</span>
                      <span className="text-xs text-muted-foreground mr-2">
                        {folderSubs.length}
                      </span>
                    </button>

                    {/* Folder Actions Menu */}
                    <DropdownMenu.Root>
                      <DropdownMenu.Trigger asChild>
                        <button
                          type="button"
                          className="opacity-0 group-hover/folder:opacity-100 p-1 hover:bg-muted rounded"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <MoreHorizontal className="w-3 h-3" />
                        </button>
                      </DropdownMenu.Trigger>
                      <DropdownMenu.Portal>
                        <DropdownMenu.Content className="min-w-30 bg-popover text-popover-foreground border border-border shadow-md rounded-md p-1 z-50 animate-in fade-in zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2">
                          <DropdownMenu.Item
                            className="flex items-center gap-2 px-2 py-1.5 text-xs outline-none hover:bg-accent hover:text-accent-foreground rounded-sm cursor-default"
                            onSelect={() => {
                              setEditingFolderId(folder.folderId);
                              setEditFolderName(folder.name);
                            }}
                          >
                            <Edit2 className="w-3 h-3" />
                            {t("rename")}
                          </DropdownMenu.Item>
                          <DropdownMenu.Item
                            className="flex items-center gap-2 px-2 py-1.5 text-xs outline-none hover:bg-destructive hover:text-destructive-foreground rounded-sm cursor-default text-red-500"
                            onSelect={() => handleDeleteFolder(folder.folderId)}
                          >
                            <Trash2 className="w-3 h-3" />
                            {t("delete")}
                          </DropdownMenu.Item>
                        </DropdownMenu.Content>
                      </DropdownMenu.Portal>
                    </DropdownMenu.Root>
                  </>
                )}
              </div>

              {/* Folder Items */}
              {isExpanded && (
                <div className="pl-6 space-y-0.5 mt-0.5">
                  {folderSubs.map((sub) => (
                    <FeedItem
                      key={sub.subscriptionId}
                      sub={sub}
                      onEdit={onEditSubscription}
                      onDelete={onDeleteSubscription}
                      onToggle={onToggleSubscriptionEnabled}
                    />
                  ))}
                  {folderSubs.length === 0 && (
                    <div className="px-2 py-2 text-xs text-muted-foreground italic">
                      {t("emptyFolder")}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {/* Unorganized Items */}
        {unorganizedSubs.length > 0 && (
          <div className="pt-2 space-y-0.5">
            {folders.length > 0 && (
              <div className="px-2 py-1 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                {t("uncategorized")}
              </div>
            )}
            {unorganizedSubs.map((sub) => (
              <FeedItem
                key={sub.subscriptionId}
                sub={sub}
                onEdit={onEditSubscription}
                onDelete={onDeleteSubscription}
                onToggle={onToggleSubscriptionEnabled}
              />
            ))}
          </div>
        )}

        {/* Empty State */}
        {subscriptions.length === 0 && folders.length === 0 && !isCreatingFolder && (
          <div className="text-center py-8 text-muted-foreground text-sm">
            {t("noFeedsOrFolders")}
          </div>
        )}
      </div>
    </div>
  );
}

function FeedItemsList({ filter, onItemClick, className, activeItemId }: FeedListItemsProps) {
  const { items, subscriptions, markAsRead, toggleSaved, isHydrated } = useRssFeeds();

  const subscriptionMap = useMemo(() => {
    const map = new Map<string, RssSubscriptionRow>();
    for (const sub of subscriptions) {
      map.set(sub.subscriptionId, sub);
    }
    return map;
  }, [subscriptions]);

  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      if (filter === "unread") {
        return item.readState === "unread";
      }
      if (filter === "saved") {
        return item.saved;
      }
      if (filter === "all") {
        return true;
      }
      return item.subscriptionId === filter;
    });
  }, [filter, items]);

  const sortedItems = useMemo(() => {
    return [...filteredItems].sort((a, b) => {
      const aTime = a.publishedAt ?? a.createdAt;
      const bTime = b.publishedAt ?? b.createdAt;
      return bTime - aTime;
    });
  }, [filteredItems]);

  // Show skeleton during hydration
  if (!isHydrated) {
    return <FeedListSkeleton count={8} />;
  }

  // Empty state - context-aware messaging
  if (sortedItems.length === 0) {
    return (
      <div
        className={cn(
          "flex-1 flex flex-col items-center justify-center text-center p-8",
          className
        )}
      >
        {filter === "unread" ? (
          // All caught up state
          <>
            <div className="w-16 h-16 rounded-full bg-linear-to-br from-green-500/20 to-emerald-500/20 flex items-center justify-center mb-4">
              <Check className="h-8 w-8 text-green-500" />
            </div>
            <h3 className="text-lg font-semibold text-foreground mb-1">All caught up!</h3>
            <p className="text-sm text-muted-foreground max-w-60">
              You've read everything. Check back later for new articles.
            </p>
          </>
        ) : filter === "saved" ? (
          // No saved items
          <>
            <div className="w-16 h-16 rounded-full bg-linear-to-br from-primary/20 to-accent-cyan/20 flex items-center justify-center mb-4">
              <Bookmark className="h-8 w-8 text-primary" />
            </div>
            <h3 className="text-lg font-semibold text-foreground mb-1">No saved articles</h3>
            <p className="text-sm text-muted-foreground max-w-60">
              Save articles for later by clicking the bookmark icon.
            </p>
          </>
        ) : (
          // Empty feed
          <>
            <div className="w-16 h-16 rounded-full bg-linear-to-br from-muted/50 to-muted/30 flex items-center justify-center mb-4">
              <Rss className="h-8 w-8 text-muted-foreground/50" />
            </div>
            <h3 className="text-lg font-semibold text-foreground mb-1">No articles yet</h3>
            <p className="text-sm text-muted-foreground max-w-60">
              Add some feeds to start reading. Articles will appear here.
            </p>
          </>
        )}
      </div>
    );
  }

  // Virtualization threshold - only virtualize for larger lists
  const VIRTUALIZATION_THRESHOLD = 30;
  const ESTIMATED_ITEM_HEIGHT = 64; // Height of FeedItemRow in pixels

  const parentRef = useRef<HTMLDivElement>(null);

  const rowVirtualizer = useVirtualizer({
    count: sortedItems.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ESTIMATED_ITEM_HEIGHT,
    overscan: 5,
  });

  // For small lists, render without virtualization
  if (sortedItems.length < VIRTUALIZATION_THRESHOLD) {
    return (
      <div className={cn("flex flex-col overflow-y-auto", className)}>
        {sortedItems.map((item) => {
          const subscription = subscriptionMap.get(item.subscriptionId);
          const sourceName =
            subscription?.displayName ??
            subscription?.title ??
            subscription?.url ??
            "Unknown source";

          return (
            <FeedItemRow
              key={item.itemId}
              id={item.itemId}
              title={item.title ?? "Untitled"}
              sourceName={sourceName}
              publishedAt={item.publishedAt ? new Date(item.publishedAt).toISOString() : undefined}
              isRead={item.readState === "read"}
              isSaved={item.saved}
              isActive={activeItemId === item.itemId}
              onClick={() => onItemClick(item.itemId)}
              onMarkRead={() => markAsRead(item.itemId)}
              onToggleSaved={() => toggleSaved(item.itemId)}
              onOpenExternal={() => item.link && window.open(item.link, "_blank", "noopener")}
            />
          );
        })}
      </div>
    );
  }

  // Virtualized rendering for large lists
  return (
    <div ref={parentRef} className={cn("flex-1 overflow-y-auto", className)}>
      <div
        style={{
          height: `${rowVirtualizer.getTotalSize()}px`,
          width: "100%",
          position: "relative",
        }}
      >
        {rowVirtualizer.getVirtualItems().map((virtualRow) => {
          const item = sortedItems[virtualRow.index];
          const subscription = subscriptionMap.get(item.subscriptionId);
          const sourceName =
            subscription?.displayName ??
            subscription?.title ??
            subscription?.url ??
            "Unknown source";

          return (
            <div
              key={item.itemId}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                height: `${virtualRow.size}px`,
                transform: `translateY(${virtualRow.start}px)`,
              }}
            >
              <FeedItemRow
                id={item.itemId}
                title={item.title ?? "Untitled"}
                sourceName={sourceName}
                publishedAt={
                  item.publishedAt ? new Date(item.publishedAt).toISOString() : undefined
                }
                isRead={item.readState === "read"}
                isSaved={item.saved}
                isActive={activeItemId === item.itemId}
                onClick={() => onItemClick(item.itemId)}
                onMarkRead={() => markAsRead(item.itemId)}
                onToggleSaved={() => toggleSaved(item.itemId)}
                onOpenExternal={() => item.link && window.open(item.link, "_blank", "noopener")}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

function FeedItem({
  sub,
  onEdit,
  onDelete,
  onToggle,
}: {
  sub: RssSubscription;
  onEdit: (sub: RssSubscription) => void;
  onDelete: (id: string) => void;
  onToggle: (id: string, enabled: boolean) => void;
}) {
  const unreadCount = getUnreadCount(sub.subscriptionId);
  const t = useTranslations("Feeds");

  return (
    <div
      className={cn(
        "group flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-muted/50 transition-colors text-sm",
        !sub.enabled && "opacity-60 grayscale"
      )}
    >
      {sub.siteUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`https://www.google.com/s2/favicons?domain=${sub.siteUrl}&sz=32`}
          alt=""
          className="w-4 h-4 rounded-sm"
          onError={(e) => {
            e.currentTarget.style.display = "none";
            e.currentTarget.nextElementSibling?.classList.remove("hidden");
          }}
        />
      ) : null}
      <Rss className={cn("w-4 h-4 text-orange-500/80", sub.siteUrl && "hidden")} />

      <span className="flex-1 truncate">
        {sub.displayName || sub.title || new URL(sub.url).hostname}
      </span>

      {unreadCount > 0 && (
        <span className="text-[10px] font-medium bg-primary/10 text-primary px-1.5 py-0.5 rounded-full min-w-5 text-center">
          {unreadCount}
        </span>
      )}

      {/* Actions */}
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          type="button"
          onClick={() => onToggle(sub.subscriptionId, !sub.enabled)}
          className="p-1 hover:bg-background rounded text-muted-foreground hover:text-foreground"
          title={sub.enabled ? t("disable") : t("enable")}
        >
          <div
            className={cn("w-2 h-2 rounded-full", sub.enabled ? "bg-green-500" : "bg-gray-300")}
          />
        </button>
        <button
          type="button"
          onClick={() => onEdit(sub)}
          className="p-1 hover:bg-background rounded text-muted-foreground hover:text-foreground"
          title={t("edit")}
        >
          <Edit2 className="w-3 h-3" />
        </button>
        <button
          type="button"
          onClick={() => onDelete(sub.subscriptionId)}
          className="p-1 hover:bg-background rounded text-muted-foreground hover:text-red-500"
          title={t("delete")}
        >
          <Trash2 className="w-3 h-3" />
        </button>
      </div>
    </div>
  );
}
