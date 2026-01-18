"use client";

import { cn } from "@ku0/shared/utils";
import { motion } from "framer-motion";
import { ExternalLink, FileText, Image as ImageIcon, Link as LinkIcon, X } from "lucide-react";
import type { ArtifactItem } from "../chat/types";

export interface ArtifactPreviewPaneProps {
  item: ArtifactItem;
  onClose: () => void;
  className?: string;
}

/**
 * ArtifactPreviewPane - A zone-level preview component that fills its container.
 *
 * Unlike the modal-based ArtifactPreview, this component is designed to be
 * placed directly in a layout zone (Main, Left, or Right).
 */
export function ArtifactPreviewPane({ item, onClose, className }: ArtifactPreviewPaneProps) {
  const TypeIcon = item.type === "image" ? ImageIcon : item.type === "link" ? LinkIcon : FileText;

  const iconColor =
    item.type === "image"
      ? "text-purple-500"
      : item.type === "link"
        ? "text-orange-500"
        : "text-blue-500";

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
      transition={{ duration: 0.2, ease: [0.32, 0.72, 0, 1] }}
      className={cn("flex flex-col h-full bg-surface-1 overflow-hidden", className)}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/10 shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <div className={cn("shrink-0 p-1.5 rounded-lg bg-surface-2/50", iconColor)}>
            <TypeIcon className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-semibold truncate">{item.title}</h3>
            <span className="text-micro text-muted-foreground uppercase tracking-wider">
              {item.type}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {item.url && (
            <a
              href={item.url}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1.5 text-xs text-blue-500 hover:text-blue-400 transition-colors px-2 py-1 rounded-md hover:bg-surface-2"
            >
              Open
              <ExternalLink className="w-3 h-3" />
            </a>
          )}
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-surface-2 transition-colors"
            aria-label="Close preview"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 bg-surface-2/5">
        {item.type === "image" ? (
          <div className="flex items-center justify-center min-h-full">
            <img
              src={item.previewUrl || item.url}
              alt={item.title}
              className="max-w-full max-h-full object-contain rounded-lg shadow-md"
            />
          </div>
        ) : item.type === "link" ? (
          <div className="flex flex-col items-center justify-center h-full text-center gap-4 text-muted-foreground">
            <div className="w-16 h-16 rounded-2xl bg-orange-500/10 flex items-center justify-center">
              <LinkIcon className="w-8 h-8 text-orange-500" />
            </div>
            <div className="max-w-md">
              <p className="text-sm">Link previews are disabled in this environment.</p>
              <a
                href={item.url}
                target="_blank"
                rel="noreferrer"
                className="text-xs text-blue-500 hover:underline break-all mt-2 block"
              >
                {item.url}
              </a>
            </div>
          </div>
        ) : (
          /* Doc / Text Preview */
          <div className="w-full max-w-3xl mx-auto bg-surface-1 border border-border/10 rounded-xl p-6 shadow-sm">
            {item.content ? (
              <pre className="whitespace-pre-wrap font-mono text-sm leading-relaxed text-foreground/80">
                {item.content}
              </pre>
            ) : (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <FileText className="w-12 h-12 mb-4 opacity-20" />
                <p>No content preview available.</p>
              </div>
            )}
          </div>
        )}
      </div>
    </motion.div>
  );
}
