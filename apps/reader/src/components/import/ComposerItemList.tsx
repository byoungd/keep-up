"use client";

/**
 * ComposerItemList - Linear-style import queue
 *
 * Design Philosophy:
 * - Minimal visual weight, maximum information density
 * - Status indicated by subtle color shifts, not badges
 * - Progressive disclosure of actions on hover
 * - Smooth layout animations
 */

import { cn } from "@/lib/utils";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertCircle,
  CheckCircle2,
  ExternalLink,
  File,
  FileText,
  Globe,
  Loader2,
  Trash2,
  Type,
  Youtube,
} from "lucide-react";
import type { AddSourceItem, SourceStatus } from "./types";

// Linear-style spring: snappy and responsive
const SPRING = { type: "spring", stiffness: 500, damping: 35 } as const;

interface ComposerItemListProps {
  items: AddSourceItem[];
  onRemove: (id: string) => void;
  onOpen: (docId: string) => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Source Icon - Contextual icon based on content type
// ─────────────────────────────────────────────────────────────────────────────

function SourceIcon({ item }: { item: AddSourceItem }) {
  const baseClass = "w-4 h-4";

  if (item.kind === "url" && item.url) {
    if (item.url.includes("youtube.com") || item.url.includes("youtu.be")) {
      return <Youtube className={cn(baseClass, "text-red-500")} aria-hidden="true" />;
    }
    return <Globe className={cn(baseClass, "text-blue-400")} aria-hidden="true" />;
  }

  switch (item.kind) {
    case "file":
      return <FileText className={cn(baseClass, "text-orange-400")} aria-hidden="true" />;
    case "text":
      return <Type className={cn(baseClass, "text-emerald-400")} aria-hidden="true" />;
    default:
      return <File className={cn(baseClass, "text-muted-foreground")} aria-hidden="true" />;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Status Indicator - Minimal inline indicator
// ─────────────────────────────────────────────────────────────────────────────

function StatusIndicator({ status }: { status: SourceStatus }) {
  if (status === "draft") {
    return null;
  }

  const config: Record<string, { icon: React.ReactNode; color: string; label: string }> = {
    queued: {
      icon: <Loader2 className="w-3 h-3 animate-spin" aria-hidden="true" />,
      color: "text-muted-foreground",
      label: "Queued",
    },
    processing: {
      icon: <Loader2 className="w-3 h-3 animate-spin" aria-hidden="true" />,
      color: "text-primary",
      label: "Processing",
    },
    ready: {
      icon: <CheckCircle2 className="w-3 h-3" aria-hidden="true" />,
      color: "text-emerald-500",
      label: "Ready",
    },
    failed: {
      icon: <AlertCircle className="w-3 h-3" aria-hidden="true" />,
      color: "text-red-500",
      label: "Failed",
    },
  };

  const statusConfig = config[status];
  if (!statusConfig) {
    return null;
  }
  const { icon, color, label } = statusConfig;

  return (
    <motion.output
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      className={cn("flex items-center", color)}
      aria-label={`Status: ${label}`}
      aria-live="polite"
    >
      {icon}
    </motion.output>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Item Row - Compact, Linear-style list item
// ─────────────────────────────────────────────────────────────────────────────

interface ItemRowProps {
  item: AddSourceItem;
  onRemove: () => void;
  onOpen: (docId: string) => void;
}

function ItemRow({ item, onRemove, onOpen }: ItemRowProps) {
  const isReady = item.status === "ready";
  const isFailed = item.status === "failed";
  const isProcessing = item.status === "processing" || item.status === "queued";

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -8, transition: { duration: 0.15 } }}
      transition={SPRING}
      className={cn(
        "group flex items-center gap-3 px-3 py-2.5 -mx-1 rounded-lg",
        "hover:bg-surface-1/80 transition-colors duration-150",
        isFailed && "bg-red-500/5"
      )}
    >
      {/* Icon */}
      <div
        className={cn(
          "w-8 h-8 rounded-md flex items-center justify-center shrink-0",
          "bg-surface-2/50 transition-colors",
          isReady && "bg-emerald-500/10",
          isFailed && "bg-red-500/10"
        )}
      >
        <SourceIcon item={item} />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "text-[13px] font-medium truncate",
              isFailed ? "text-red-500" : "text-foreground"
            )}
          >
            {item.displayName}
          </span>
          <StatusIndicator status={item.status} />
        </div>

        {/* Secondary info */}
        {(item.errorMessage || (item.kind === "file" && item.sizeBytes)) && (
          <p
            className={cn(
              "text-[11px] truncate mt-0.5",
              isFailed ? "text-red-500/80" : "text-muted-foreground/60"
            )}
          >
            {item.errorMessage ??
              (item.sizeBytes ? `${(item.sizeBytes / 1024).toFixed(0)} KB` : null)}
          </p>
        )}
      </div>

      {/* Actions - revealed on hover */}
      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
        {isReady && item.resultDocumentId && (
          <button
            type="button"
            onClick={() => onOpen(item.resultDocumentId ?? "")}
            className={cn(
              "p-1.5 rounded-md",
              "text-muted-foreground hover:text-foreground hover:bg-surface-2",
              "transition-colors duration-150"
            )}
            aria-label="Open document"
          >
            <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
        )}

        {!isProcessing && (
          <button
            type="button"
            onClick={onRemove}
            className={cn(
              "p-1.5 rounded-md",
              "text-muted-foreground/50 hover:text-red-500 hover:bg-red-500/10",
              "transition-colors duration-150"
            )}
            aria-label="Remove item"
          >
            <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
        )}
      </div>
    </motion.div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main List Component
// ─────────────────────────────────────────────────────────────────────────────

export function ComposerItemList({ items, onRemove, onOpen }: ComposerItemListProps) {
  if (items.length === 0) {
    return null;
  }

  return (
    <motion.div layout className="mt-3">
      {/* Header */}
      <div className="flex items-center gap-2 px-2 mb-1">
        <span className="text-[11px] font-medium text-muted-foreground/60 uppercase tracking-wider">
          Queue
        </span>
        <span className="text-[11px] text-muted-foreground/40">{items.length}</span>
      </div>

      {/* List */}
      {/* biome-ignore lint/a11y/noNoninteractiveTabindex: Scroll container needs focus for keyboard scroll */}
      <div className="max-h-[240px] overflow-y-auto -mx-1 px-1" tabIndex={0}>
        <AnimatePresence mode="popLayout" initial={false}>
          {items.map((item) => (
            <ItemRow
              key={item.localId}
              item={item}
              onRemove={() => onRemove(item.localId)}
              onOpen={onOpen}
            />
          ))}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
