"use client";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { useBriefs } from "@/hooks/useBriefs";
import { cn } from "@ku0/shared/utils";
import { Check, FilePlus, FileText, Loader2, Plus, Search } from "lucide-react";
import { useMemo, useState } from "react";

interface PinToBriefModalProps {
  isOpen: boolean;
  onClose: () => void;
  itemTitle: string;
  itemUrl?: string;
  itemId?: string;
  itemType?: "digest_card" | "feed_item" | "document" | "url";
  excerpt?: string;
  onSuccess?: () => void;
}

// Helper to format relative time
function formatRelativeTime(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const hours = Math.floor(diff / (1000 * 60 * 60));
  if (hours < 1) {
    return "just now";
  }
  if (hours < 24) {
    return `${hours}h ago`;
  }
  const days = Math.floor(hours / 24);
  if (days < 7) {
    return `${days}d ago`;
  }
  const weeks = Math.floor(days / 7);
  return `${weeks}w ago`;
}

export function PinToBriefModal({
  isOpen,
  onClose,
  itemTitle,
  itemUrl,
  itemId,
  itemType = "digest_card",
  excerpt,
  onSuccess,
}: PinToBriefModalProps) {
  const { briefs, isLoading: isBriefsLoading, createBrief, addItemToBrief } = useBriefs();
  const [selectedBriefId, setSelectedBriefId] = useState<string | null>(null);
  const [newBriefTitle, setNewBriefTitle] = useState("");
  const [activeTab, setActiveTab] = useState<"select" | "create">("select");
  const [searchQuery, setSearchQuery] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Filter briefs based on search
  const filteredBriefs = useMemo(() => {
    if (!searchQuery) {
      return briefs;
    }
    return briefs.filter((b) => b.title.toLowerCase().includes(searchQuery.toLowerCase()));
  }, [searchQuery, briefs]);

  const handlePin = async () => {
    setIsSubmitting(true);

    try {
      let targetBriefId = selectedBriefId;

      if (activeTab === "create") {
        // Create a new brief
        const newBrief = await createBrief(newBriefTitle.trim());
        targetBriefId = newBrief.briefId;
      }

      if (!targetBriefId) {
        throw new Error("No brief selected");
      }

      // Generate a unique item ID if not provided
      const actualItemId = itemId ?? `item_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

      // Add the item to the brief
      await addItemToBrief(targetBriefId, {
        itemId: actualItemId,
        itemType: itemType,
        title: itemTitle,
        sourceUrl: itemUrl,
        excerpt: excerpt,
      });

      onSuccess?.();
      onClose();
    } catch (err) {
      console.error("[PinToBriefModal] Failed to pin item:", err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const isValid = activeTab === "create" ? newBriefTitle.trim().length > 0 : !!selectedBriefId;

  return (
    <Dialog
      open={isOpen}
      onOpenChange={onClose}
      title="Add to Living Brief"
      description="Save this item to a collaborative workspace."
      size="md"
      className="gap-0 p-0" // Reset standard padding to allow full control if needed, though Dialog enforces padding in its implementation.
      // Note: The Dialog component implementation enforces padding in layout, so we work within it.
    >
      <div className="space-y-6 pt-2">
        {/* Custom Segmented Control */}
        <div className="grid grid-cols-2 p-1 bg-muted/40 rounded-lg border border-border/50">
          <button
            type="button"
            onClick={() => setActiveTab("select")}
            className={cn(
              "flex items-center justify-center gap-2 py-2 text-sm font-medium rounded-md transition-all duration-200",
              activeTab === "select"
                ? "bg-surface-1 text-foreground shadow-sm ring-1 ring-black/5 dark:ring-white/5"
                : "text-muted-foreground hover:text-foreground/80 hover:bg-surface-2/50"
            )}
          >
            <FileText className="w-4 h-4" />
            Select Brief
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("create")}
            className={cn(
              "flex items-center justify-center gap-2 py-2 text-sm font-medium rounded-md transition-all duration-200",
              activeTab === "create"
                ? "bg-surface-1 text-foreground shadow-sm ring-1 ring-black/5 dark:ring-white/5"
                : "text-muted-foreground hover:text-foreground/80 hover:bg-surface-2/50"
            )}
          >
            <FilePlus className="w-4 h-4" />
            Create New
          </button>
        </div>

        <div className="min-h-[220px]">
          {activeTab === "create" ? (
            <div className="space-y-5 animate-in fade-in slide-in-from-bottom-2 duration-300">
              <div className="space-y-2">
                <Label
                  htmlFor="brief-title"
                  className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/80 ml-0.5"
                >
                  New Brief Title
                </Label>
                <div className="relative group">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <FilePlus className="h-4 w-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
                  </div>
                  <Input
                    id="brief-title"
                    placeholder="e.g. Q2 Roadmap Research"
                    className="pl-9 h-11 bg-surface-2/30 border-border/60 focus-visible:ring-primary/20 transition-all"
                    value={newBriefTitle}
                    onChange={(e) => setNewBriefTitle(e.target.value)}
                    autoFocus
                    onKeyDown={(e) => e.key === "Enter" && isValid && handlePin()}
                  />
                </div>
              </div>

              <div className="rounded-xl bg-gradient-to-br from-amber-500/10 to-transparent border border-amber-500/20 p-4">
                <div className="flex gap-3">
                  <div className="mt-0.5 w-6 h-6 rounded-full bg-amber-500/20 flex items-center justify-center shrink-0 text-amber-600 dark:text-amber-400 font-bold text-xs">
                    !
                  </div>
                  <div className="space-y-1">
                    <h4 className="text-sm font-medium text-amber-700 dark:text-amber-400">
                      Creates a new LFCC Workspace
                    </h4>
                    <p className="text-xs text-amber-700/80 dark:text-amber-400/80 leading-relaxed">
                      This will generate a fresh Living Brief. You can pin more items to it and
                      invite your team to collaborate in real-time.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-3 animate-in fade-in slide-in-from-left-2 duration-300">
              {/* Search */}
              <div className="relative group">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground group-focus-within:text-foreground transition-colors" />
                <Input
                  placeholder="Search briefs..."
                  className="pl-9 h-10 border-border/40 bg-surface-2/30 focus:bg-surface-1 transition-colors"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>

              {/* List */}
              <div className="space-y-1 max-h-[240px] overflow-y-auto pr-1 -mr-1 custom-scrollbar">
                {isBriefsLoading ? (
                  <div className="flex flex-col items-center justify-center py-8 text-center text-muted-foreground">
                    <Loader2 className="h-6 w-6 mb-2 animate-spin opacity-50" />
                    <p className="text-sm">Loading briefs...</p>
                  </div>
                ) : filteredBriefs.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-8 text-center text-muted-foreground">
                    <FileText className="h-8 w-8 mb-2 opacity-20" />
                    <p className="text-sm">No briefs found.</p>
                  </div>
                ) : (
                  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: rendering list with conditional badges and actions
                  filteredBriefs.map((brief) => (
                    <button
                      key={brief.briefId}
                      type="button"
                      onClick={() => setSelectedBriefId(brief.briefId)}
                      className={cn(
                        "w-full flex items-center justify-between p-3 rounded-lg border text-left transition-all duration-200 group/item",
                        selectedBriefId === brief.briefId
                          ? "border-primary/40 bg-primary/5 shadow-sm ring-1 ring-primary/20"
                          : "border-transparent hover:bg-surface-2/80 hover:border-border/50"
                      )}
                    >
                      <div className="flex items-center gap-3 overflow-hidden">
                        <div
                          className={cn(
                            "w-9 h-9 rounded-full flex items-center justify-center transition-colors shrink-0",
                            selectedBriefId === brief.briefId
                              ? "bg-primary text-primary-foreground shadow-sm"
                              : "bg-surface-2 text-muted-foreground group-hover/item:bg-surface-3 group-hover/item:text-foreground"
                          )}
                        >
                          {selectedBriefId === brief.briefId ? (
                            <Check className="w-4 h-4" />
                          ) : (
                            <FileText className="w-4 h-4" />
                          )}
                        </div>
                        <div className="truncate">
                          <div
                            className={cn(
                              "text-sm font-medium truncate",
                              selectedBriefId === brief.briefId ? "text-primary" : "text-foreground"
                            )}
                          >
                            {brief.title}
                          </div>
                          <div className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                            <span>Updated {formatRelativeTime(brief.updatedAt)}</span>
                          </div>
                        </div>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between border-t border-border/40 pt-4 mt-6">
          <span className="text-[10px] text-muted-foreground/60 uppercase tracking-widest font-medium pl-1">
            {activeTab === "create" ? "New Workspace" : `${filteredBriefs.length} Available`}
          </span>
          <div className="flex gap-3">
            <Button variant="ghost" onClick={onClose} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button
              onClick={handlePin}
              disabled={isSubmitting || !isValid}
              className="min-w-[100px] shadow-sm active:scale-95 transition-transform"
            >
              {isSubmitting ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : (
                <Plus className="w-4 h-4 mr-2" />
              )}
              {isSubmitting ? "Saving..." : "Pin Item"}
            </Button>
          </div>
        </div>
      </div>
    </Dialog>
  );
}
