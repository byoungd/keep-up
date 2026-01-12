/**
 * AddFeedModal - Modal to add a new RSS subscription
 */

"use client";

import { Button } from "@/components/ui/Button";
import { useRssStore } from "@/lib/rss";
import { cn } from "@keepup/shared/utils";
import { AlertCircle, Loader2, Plus, Rss, X } from "lucide-react";
import * as React from "react";

interface AddFeedModalProps {
  open: boolean;
  onClose: () => void;
}

export function AddFeedModal({ open, onClose }: AddFeedModalProps) {
  const [url, setUrl] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const { addSubscription } = useRssStore();

  // Focus input when modal opens
  React.useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open]);

  // Close on Escape
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && open) {
        onClose();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const trimmedUrl = url.trim();
    if (!trimmedUrl) {
      setError("Please enter a URL");
      return;
    }

    // Basic URL validation
    try {
      new URL(trimmedUrl);
    } catch {
      setError("Please enter a valid URL");
      return;
    }

    setIsSubmitting(true);
    try {
      await addSubscription(trimmedUrl);
      setUrl("");
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add feed");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
        onKeyDown={(e) => e.key === "Enter" && onClose()}
        role="button"
        tabIndex={0}
        aria-label="Close modal"
      />

      {/* Modal */}
      <div className="relative w-full max-w-md mx-4 bg-surface-1 border border-border/20 rounded-xl shadow-2xl animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border/10">
          <div className="flex items-center gap-2">
            <Rss className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-semibold">Add RSS Feed</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="h-6 w-6 flex items-center justify-center rounded text-muted-foreground/60 hover:text-foreground hover:bg-surface-2 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div className="space-y-2">
            <label htmlFor="feed-url" className="text-xs font-medium text-muted-foreground">
              Feed URL
            </label>
            <input
              ref={inputRef}
              id="feed-url"
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.com/feed.xml"
              className={cn(
                "w-full px-3 py-2 text-sm bg-surface-2 border rounded-lg",
                "placeholder:text-muted-foreground/50",
                "focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50",
                error ? "border-red-500/50" : "border-border/20"
              )}
              autoComplete="off"
            />
          </div>

          {error && (
            <div className="flex items-center gap-2 text-xs text-red-500">
              <AlertCircle className="h-3.5 w-3.5" />
              <span>{error}</span>
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" size="compact" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" size="compact" disabled={isSubmitting}>
              {isSubmitting ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                  Adding...
                </>
              ) : (
                <>
                  <Plus className="h-3.5 w-3.5 mr-1.5" />
                  Add Feed
                </>
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
