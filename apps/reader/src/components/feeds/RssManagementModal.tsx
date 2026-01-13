"use client";

import { useFeedProvider } from "@/providers/FeedProvider";
import type { RssFolder, RssSubscription } from "@keepup/db";
import { cn } from "@keepup/shared/utils";
import * as Dialog from "@radix-ui/react-dialog";
import { ChevronLeft, Plus, Rss, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";
import { AddFeedForm } from "./AddFeedForm";
import { FeedList } from "./FeedList";
import { PopularFeeds } from "./PopularFeeds";

interface RssManagementModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type ModalView = "list" | "add" | "edit";

export function RssManagementModal({ open, onOpenChange }: RssManagementModalProps) {
  const t = useTranslations("Feeds");
  const { subscriptions, folders, addFeed, removeFeed, updateFeed } = useFeedProvider();

  const [view, setView] = useState<ModalView>("list");
  const [editingSubscription, setEditingSubscription] = useState<RssSubscription | null>(null);

  useEffect(() => {
    if (open) {
      setView("list");
    }
  }, [open]);

  const handleAddFeed = useCallback(
    async (url: string, _title?: string) => {
      // Title is optional and often unused
      try {
        await addFeed(url);
        // loadData(); // Handled by provider
        setView("list");
      } catch (err) {
        // Handle duplicate error
        console.error("Failed to add feed:", err);
      }
    },
    [addFeed]
  );

  const handleDeleteSubscription = useCallback(
    async (subscriptionId: string) => {
      await removeFeed(subscriptionId);
    },
    [removeFeed]
  );

  const handleToggleEnabled = useCallback(
    async (subscriptionId: string, enabled: boolean) => {
      await updateFeed(subscriptionId, { enabled });
    },
    [updateFeed]
  );

  const renderContent = () => {
    switch (view) {
      case "add":
        return (
          <div className="space-y-6">
            <AddFeedForm onSubmit={handleAddFeed} onCancel={() => setView("list")} />
            <div className="border-t border-border pt-4">
              <PopularFeeds onSelect={(url, title) => handleAddFeed(url, title)} />
            </div>
          </div>
        );
      case "edit":
        return editingSubscription ? (
          <EditFeedView
            subscription={editingSubscription}
            folders={folders}
            onSave={async (updates) => {
              if (editingSubscription) {
                await updateFeed(editingSubscription.subscriptionId, updates);
              }
              setView("list");
            }}
            onCancel={() => setView("list")}
          />
        ) : null;
      default:
        return (
          <FeedList
            subscriptions={subscriptions}
            folders={folders}
            onEditSubscription={(sub) => {
              setEditingSubscription(sub);
              setView("edit");
            }}
            onDeleteSubscription={handleDeleteSubscription}
            onToggleSubscriptionEnabled={handleToggleEnabled}
            onRefresh={() => {
              /* Provider handles refresh usually */
            }}
          />
        );
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50" />
        <Dialog.Content
          className={cn(
            "fixed left-[50%] top-[50%] translate-x-[-50%] translate-y-[-50%]",
            "w-full max-w-[600px] max-h-[80vh] bg-background rounded-xl shadow-xl z-50",
            "border border-border flex flex-col"
          )}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-border">
            <div className="flex items-center gap-3">
              {view !== "list" && (
                <button
                  type="button"
                  onClick={() => setView("list")}
                  className="p-1 rounded hover:bg-muted"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
              )}
              <Dialog.Title className="text-lg font-semibold flex items-center gap-2">
                <Rss className="w-5 h-5 text-primary" />
                {view === "add" ? t("addFeed") : view === "edit" ? t("editFeed") : t("manageFeeds")}
              </Dialog.Title>
            </div>
            <div className="flex items-center gap-2">
              {view === "list" && (
                <button
                  type="button"
                  onClick={() => setView("add")}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90"
                >
                  <Plus className="w-4 h-4" />
                  {t("addFeed")}
                </button>
              )}
              <Dialog.Close className="p-1.5 rounded-md hover:bg-muted">
                <X className="w-4 h-4" />
              </Dialog.Close>
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-6">{renderContent()}</div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

// ... (FeedList component is now external)

// ============ Edit Feed View ============
import { getDbClient } from "@/lib/db";
import { useQuery } from "@tanstack/react-query";

interface EditFeedViewProps {
  subscription: RssSubscription;
  folders: RssFolder[];
  onSave: (updates: { displayName?: string; folderId?: string | null }) => void;
  onCancel: () => void;
}

function EditFeedView({ subscription, folders, onSave, onCancel }: EditFeedViewProps) {
  const t = useTranslations("Feeds");
  const { topics, addFeedToTopic, removeFeedFromTopic } = useFeedProvider();

  const [displayName, setDisplayName] = useState(subscription.displayName || "");
  const [folderId, setFolderId] = useState(subscription.folderId || "");

  // Fetch topics associated with this subscription
  const { data: subTopics = [], refetch: refetchSubTopics } = useQuery({
    queryKey: ["subscription-topics", subscription.subscriptionId],
    queryFn: async () => {
      const db = await getDbClient();
      return db.listTopicsBySubscription(subscription.subscriptionId);
    },
  });

  const subTopicIds = new Set(subTopics.map((t) => t.topicId));

  const handleToggleTopic = async (topicId: string, isSelected: boolean) => {
    if (isSelected) {
      await removeFeedFromTopic(subscription.subscriptionId, topicId);
    } else {
      await addFeedToTopic(subscription.subscriptionId, topicId);
    }
    refetchSubTopics();
  };

  return (
    <div className="space-y-4">
      <div>
        <label htmlFor="display-name" className="block text-sm font-medium mb-1.5">
          {t("displayName")}
        </label>
        <input
          id="display-name"
          type="text"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder={subscription.title || ""}
          className="w-full px-3 py-2 rounded-lg border border-input bg-background"
        />
      </div>

      {/* Topics */}
      <fieldset className="space-y-1.5">
        <legend className="text-sm font-medium">Topics</legend>
        <div className="flex flex-wrap gap-2">
          {topics.map((topic) => {
            const isSelected = subTopicIds.has(topic.topicId);
            return (
              <button
                key={topic.topicId}
                type="button"
                onClick={() => handleToggleTopic(topic.topicId, isSelected)}
                className={cn(
                  "flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs transition-colors border",
                  isSelected
                    ? "bg-primary/10 border-primary/20 text-primary"
                    : "bg-muted/30 border-transparent text-muted-foreground hover:bg-muted"
                )}
              >
                <div
                  className="w-2 h-2 rounded-full"
                  style={{ backgroundColor: topic.color || "currentColor" }}
                />
                {topic.name}
              </button>
            );
          })}
          {topics.length === 0 && (
            <div className="text-xs text-muted-foreground italic">No topics created.</div>
          )}
        </div>
      </fieldset>

      {/* Folders (Stubbed/Legacy) */}
      {folders.length > 0 && (
        <div>
          <label htmlFor="folder-select" className="block text-sm font-medium mb-1.5">
            {t("folder")}
          </label>
          <select
            id="folder-select"
            value={folderId}
            onChange={(e) => setFolderId(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-input bg-background"
          >
            <option value="">{t("noFolder")}</option>
            {folders.map((f) => (
              <option key={f.folderId} value={f.folderId}>
                {f.name}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="flex justify-end gap-3 pt-4">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 rounded-lg hover:bg-muted font-medium"
        >
          {t("cancel")}
        </button>
        <button
          type="button"
          onClick={() =>
            onSave({ displayName: displayName || undefined, folderId: folderId || null })
          }
          className="px-4 py-2 rounded-lg bg-primary text-primary-foreground font-medium hover:bg-primary/90"
        >
          {t("save")}
        </button>
      </div>
    </div>
  );
}
