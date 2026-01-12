"use client";

import {
  createSubscription,
  deleteSubscription,
  listFolders,
  listSubscriptions,
  updateSubscription,
} from "@keepup/db";
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
  const [view, setView] = useState<ModalView>("list");
  const [subscriptions, setSubscriptions] = useState<RssSubscription[]>([]);
  const [folders, setFolders] = useState<RssFolder[]>([]);
  const [editingSubscription, setEditingSubscription] = useState<RssSubscription | null>(null);

  const loadData = useCallback(() => {
    setSubscriptions(listSubscriptions());
    setFolders(listFolders());
  }, []);

  useEffect(() => {
    if (open) {
      loadData();
      setView("list");
    }
  }, [open, loadData]);

  const handleAddFeed = useCallback(
    (url: string, title?: string) => {
      try {
        createSubscription({ url, title });
        loadData();
        setView("list");
      } catch (err) {
        // Handle duplicate error
        console.error("Failed to add feed:", err);
      }
    },
    [loadData]
  );

  const handleDeleteSubscription = useCallback(
    (subscriptionId: string) => {
      deleteSubscription(subscriptionId);
      loadData();
    },
    [loadData]
  );

  const handleToggleEnabled = useCallback(
    (subscriptionId: string, enabled: boolean) => {
      updateSubscription(subscriptionId, { enabled });
      loadData();
    },
    [loadData]
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
            onSave={(updates) => {
              updateSubscription(editingSubscription.subscriptionId, updates);
              loadData();
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
            onRefresh={loadData}
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

interface EditFeedViewProps {
  subscription: RssSubscription;
  folders: RssFolder[];
  onSave: (updates: { displayName?: string; folderId?: string | null }) => void;
  onCancel: () => void;
}

function EditFeedView({ subscription, folders, onSave, onCancel }: EditFeedViewProps) {
  const t = useTranslations("Feeds");
  const [displayName, setDisplayName] = useState(subscription.displayName || "");
  const [folderId, setFolderId] = useState(subscription.folderId || "");

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
