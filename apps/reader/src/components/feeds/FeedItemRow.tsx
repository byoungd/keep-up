/**
 * FeedItemRow - Linear-style feed item row
 *
 * Dense, polished row with micro-animations and keyboard focus.
 */

"use client";

import { cn } from "@ku0/shared/utils";
import { motion } from "framer-motion";
import { BookmarkIcon, Check, Circle, ExternalLink } from "lucide-react";
import * as React from "react";

export interface FeedItemRowProps {
  id: string;
  title: string;
  sourceName: string;
  publishedAt?: string;
  isRead: boolean;
  isSaved: boolean;
  isActive?: boolean;
  onClick?: () => void;
  onMarkRead?: () => void;
  onToggleSaved?: () => void;
  onOpenExternal?: () => void;
}

export const FeedItemRow = React.memo(function FeedItemRow({
  title,
  sourceName,
  publishedAt,
  isRead,
  isSaved,
  isActive,
  onClick,
  onMarkRead,
  onToggleSaved,
  onOpenExternal,
}: FeedItemRowProps) {
  const formattedDate = React.useMemo(() => {
    if (!publishedAt) {
      return "";
    }
    const date = new Date(publishedAt);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) {
      const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
      if (diffHours === 0) {
        const diffMins = Math.floor(diffMs / (1000 * 60));
        return `${diffMins}m`;
      }
      return `${diffHours}h`;
    }
    if (diffDays < 7) {
      return `${diffDays}d`;
    }
    return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  }, [publishedAt]);

  return (
    <motion.button
      type="button"
      onClick={onClick}
      layout
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      whileHover={{ backgroundColor: "var(--surface-2)" }}
      whileTap={{ scale: 0.995 }}
      transition={{ duration: 0.1 }}
      className={cn(
        // Base styles
        "group relative flex items-center gap-3 px-4 py-2.5 cursor-pointer w-full text-left",
        "border-b border-border/5",
        // Active/selected state
        isActive && "bg-primary/5",
        // Unread state
        !isRead && !isActive && "bg-surface-1",
        // Focus state
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:ring-inset"
      )}
    >
      {/* Active indicator bar - thinner and subtler */}
      {isActive && (
        <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[2px] h-4 bg-primary rounded-r-full shadow-[0_0_6px_var(--color-primary)]" />
      )}

      {/* Unread indicator - solid dot, no ping for premium feel */}
      <div className="w-2.5 shrink-0 flex items-center justify-center mr-1">
        {!isRead && <Circle className="h-1.5 w-1.5 fill-primary text-primary" />}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div
          className={cn(
            "text-[13px] leading-relaxed truncate transition-colors",
            isRead ? "text-muted-foreground font-normal" : "text-foreground font-medium"
          )}
        >
          {title}
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] text-muted-foreground/60 truncate max-w-[120px] font-medium">
            {sourceName}
          </span>
          {formattedDate && (
            <>
              <span className="text-muted-foreground/20 text-[6px]">•</span>
              <span className="text-[10px] text-muted-foreground/50 tabular-nums">
                {formattedDate}
              </span>
            </>
          )}
        </div>
      </div>

      {/* Saved indicator (always visible when saved) */}
      {isSaved && (
        <BookmarkIcon className="h-3 w-3 text-orange-500 fill-orange-500 shrink-0 group-hover:hidden transition-transform" />
      )}

      {/* Actions (visible on hover) */}
      <div
        className={cn(
          "flex items-center gap-0.5 transition-all duration-150",
          "opacity-0 scale-95 group-hover:opacity-100 group-hover:scale-100"
        )}
      >
        {!isRead && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onMarkRead?.();
            }}
            className="p-1.5 rounded-md hover:bg-surface-3 text-muted-foreground hover:text-foreground transition-colors"
            title="Mark as read"
            aria-label="Mark as read"
          >
            <Check className="h-3.5 w-3.5" />
          </button>
        )}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onToggleSaved?.();
          }}
          className={cn(
            "p-1.5 rounded-md transition-colors",
            isSaved
              ? "text-primary hover:bg-primary/10"
              : "text-muted-foreground hover:bg-surface-3 hover:text-foreground"
          )}
          title={isSaved ? "Unsave" : "Save"}
          aria-label={isSaved ? "Unsave article" : "Save article"}
        >
          <BookmarkIcon className={cn("h-3.5 w-3.5", isSaved && "fill-current")} />
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onOpenExternal?.();
          }}
          className="p-1.5 rounded-md hover:bg-surface-3 text-muted-foreground hover:text-foreground transition-colors"
          title="Open original"
          aria-label="Open original article in new tab"
        >
          <ExternalLink className="h-3.5 w-3.5" />
        </button>
      </div>
    </motion.button>
  );
});
