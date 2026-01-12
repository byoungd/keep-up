"use client";

import { AlertCircle, Check, FileText, Loader2, Rss } from "lucide-react";
import * as React from "react";

import { Button } from "@/components/ui/Button";
import { Dialog, DialogFooter } from "@/components/ui/Dialog";
import { Input } from "@/components/ui/Input";
import { type RSSFeedItem, fetchRssFeed, importRssFeedItem } from "@/lib/import/importFromRss";

export interface RSSFeedDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImportSuccess?: (count: number) => void;
}

type DialogState = "input" | "fetching" | "selection" | "importing" | "done" | "error";

interface FeedState {
  state: DialogState;
  url: string;
  feedTitle: string;
  items: RSSFeedItem[];
  selectedItems: Set<string>;
  importedCount: number;
  error: string | null;
}

export function RSSFeedDialog({ open, onOpenChange, onImportSuccess }: RSSFeedDialogProps) {
  const [feed, setFeed] = React.useState<FeedState>({
    state: "input",
    url: "",
    feedTitle: "",
    items: [],
    selectedItems: new Set(),
    importedCount: 0,
    error: null,
  });

  const inputRef = React.useRef<HTMLInputElement>(null);

  // Reset on open
  React.useEffect(() => {
    if (open) {
      setFeed({
        state: "input",
        url: "",
        feedTitle: "",
        items: [],
        selectedItems: new Set(),
        importedCount: 0,
        error: null,
      });
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open]);

  const handleFetchFeed = async () => {
    const url = feed.url.trim();
    if (!url) {
      setFeed((prev) => ({ ...prev, error: "Please enter a feed URL" }));
      return;
    }

    setFeed((prev) => ({ ...prev, state: "fetching", error: null }));

    try {
      const result = await fetchRssFeed(url);
      const allGuids = new Set(result.items.map((item) => item.guid || item.link));

      setFeed((prev) => ({
        ...prev,
        state: "selection",
        feedTitle: result.feedTitle,
        items: result.items,
        selectedItems: allGuids,
      }));
    } catch (err) {
      setFeed((prev) => ({
        ...prev,
        state: "error",
        error: err instanceof Error ? err.message : "Failed to fetch feed",
      }));
    }
  };

  const handleToggleItem = (guid: string) => {
    setFeed((prev) => {
      const newSelected = new Set(prev.selectedItems);
      if (newSelected.has(guid)) {
        newSelected.delete(guid);
      } else {
        newSelected.add(guid);
      }
      return { ...prev, selectedItems: newSelected };
    });
  };

  const handleSelectAll = () => {
    const allGuids = new Set(feed.items.map((item) => item.guid || item.link));
    setFeed((prev) => ({ ...prev, selectedItems: allGuids }));
  };

  const handleDeselectAll = () => {
    setFeed((prev) => ({ ...prev, selectedItems: new Set() }));
  };

  const handleImport = async () => {
    setFeed((prev) => ({ ...prev, state: "importing", importedCount: 0 }));

    const selectedItems = feed.items.filter((item) =>
      feed.selectedItems.has(item.guid || item.link)
    );

    let imported = 0;
    for (const item of selectedItems) {
      try {
        await importRssFeedItem(item, feed.url);
        imported++;
        setFeed((prev) => ({ ...prev, importedCount: imported }));
      } catch {
        // Continue with other items
      }
    }

    setFeed((prev) => ({ ...prev, state: "done" }));
    onImportSuccess?.(imported);

    setTimeout(() => onOpenChange(false), 1000);
  };

  const renderContent = () => {
    switch (feed.state) {
      case "input":
      case "error":
        return (
          <div className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="rss-url" className="text-sm font-medium text-foreground">
                Feed URL
              </label>
              <div className="relative">
                <div className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                  <Rss className="h-4 w-4" />
                </div>
                <Input
                  ref={inputRef}
                  id="rss-url"
                  type="url"
                  placeholder="https://example.com/feed.xml"
                  value={feed.url}
                  onChange={(e) =>
                    setFeed((prev) => ({ ...prev, url: e.target.value, error: null }))
                  }
                  onKeyDown={(e) => e.key === "Enter" && handleFetchFeed()}
                  className="pl-10"
                />
              </div>
              {feed.error && (
                <div className="flex items-center gap-2 text-sm text-destructive">
                  <AlertCircle className="h-4 w-4" />
                  {feed.error}
                </div>
              )}
            </div>

            <DialogFooter>
              <Button variant="ghost" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button onClick={handleFetchFeed}>Fetch Feed</Button>
            </DialogFooter>
          </div>
        );

      case "fetching":
        return (
          <div className="flex flex-col items-center justify-center py-8 gap-4">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Fetching feed...</p>
          </div>
        );

      case "selection":
        return (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-medium">{feed.feedTitle}</h3>
                <p className="text-sm text-muted-foreground">
                  {feed.items.length} items • {feed.selectedItems.size} selected
                </p>
              </div>
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" onClick={handleSelectAll}>
                  All
                </Button>
                <Button variant="ghost" size="sm" onClick={handleDeselectAll}>
                  None
                </Button>
              </div>
            </div>

            <div className="max-h-64 overflow-y-auto border rounded-lg divide-y divide-border">
              {feed.items.map((item) => {
                const id = item.guid || item.link;
                const isSelected = feed.selectedItems.has(id);
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => handleToggleItem(id)}
                    className={`w-full text-left px-3 py-2 hover:bg-surface-2 transition-colors ${
                      isSelected ? "bg-surface-2" : ""
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div
                        className={`mt-0.5 w-4 h-4 rounded border flex items-center justify-center ${
                          isSelected
                            ? "bg-primary border-primary text-primary-foreground"
                            : "border-border"
                        }`}
                      >
                        {isSelected && <Check className="h-3 w-3" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{item.title}</p>
                        {item.pubDate && (
                          <p className="text-xs text-muted-foreground">
                            {new Date(item.pubDate).toLocaleDateString()}
                          </p>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>

            <DialogFooter>
              <Button
                variant="ghost"
                onClick={() => setFeed((prev) => ({ ...prev, state: "input" }))}
              >
                Back
              </Button>
              <Button onClick={handleImport} disabled={feed.selectedItems.size === 0}>
                Import {feed.selectedItems.size} items
              </Button>
            </DialogFooter>
          </div>
        );

      case "importing":
        return (
          <div className="flex flex-col items-center justify-center py-8 gap-4">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Importing... {feed.importedCount}/{feed.selectedItems.size}
            </p>
          </div>
        );

      case "done":
        return (
          <div className="flex flex-col items-center justify-center py-8 gap-4">
            <div className="h-12 w-12 rounded-full bg-success/10 flex items-center justify-center">
              <FileText className="h-6 w-6 text-success" />
            </div>
            <p className="text-sm text-foreground">Imported {feed.importedCount} articles</p>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Import RSS Feed"
      description="Subscribe to an RSS or Atom feed to import articles"
      size="lg"
    >
      {renderContent()}
    </Dialog>
  );
}
