"use client";

import { cn } from "@ku0/shared/utils";
import { ExternalLink, FileText, Image as ImageIcon, Link as LinkIcon } from "lucide-react";
import { useEffect, useState } from "react";
import type { ArtifactItem } from "../chat/types"; // Correct import path
import { Dialog } from "./Dialog";

export interface ArtifactPreviewProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  items: ArtifactItem[];
  initialIndex?: number;
}

// Reusable Content Component
export function ArtifactView({ item }: { item: ArtifactItem }) {
  if (!item) {
    return null;
  }

  return (
    <div className="flex-1 flex flex-col min-w-0 bg-surface-1 h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border/5 shrink-0">
        <h3 className="font-semibold text-lg truncate flex items-center gap-2">
          {item.type === "image" ? (
            <ImageIcon className="w-5 h-5 text-accent-violet" />
          ) : item.type === "link" ? (
            <LinkIcon className="w-5 h-5 text-accent-amber" />
          ) : (
            <FileText className="w-5 h-5 text-accent-indigo" />
          )}
          {item.title}
        </h3>

        {item.url && (
          <a
            href={item.url}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1.5 text-sm text-primary hover:text-primary/80 transition-colors duration-fast"
          >
            Open Original
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto scrollbar-auto-hide p-6 bg-surface-2/5 relative">
        {item.type === "image" ? (
          <div className="flex items-center justify-center min-h-full">
            <img
              src={item.previewUrl || item.url}
              alt={item.title}
              className="max-w-full max-h-full object-contain rounded-lg shadow-md"
            />
          </div>
        ) : item.type === "link" ? (
          <div className="w-full h-full flex flex-col items-center justify-center text-center gap-4 text-muted-foreground">
            <div className="w-16 h-16 rounded-2xl bg-accent-amber/10 flex items-center justify-center">
              <LinkIcon className="w-8 h-8 text-accent-amber" />
            </div>
            <div className="max-w-md">
              Link previews are disabled in this environment.
              <br />
              <span className="text-sm opacity-70 break-all">{item.url}</span>
            </div>
          </div>
        ) : (
          /* Doc / Text Preview */
          <div className="w-full max-w-3xl mx-auto bg-surface-1 border border-border/10 rounded-xl p-8 shadow-sm h-full overflow-y-auto scrollbar-auto-hide">
            {item.content ? (
              <pre className="whitespace-pre-wrap font-mono text-sm leading-relaxed text-foreground/80">
                {item.content}
              </pre>
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                <FileText className="w-12 h-12 mb-4 opacity-20" />
                <p>No content preview available.</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export function ArtifactPreview({
  isOpen,
  onClose,
  title,
  items,
  initialIndex = 0,
}: ArtifactPreviewProps) {
  const [selectedIndex, setSelectedIndex] = useState(initialIndex);

  // Reset index when items or open state changes
  useEffect(() => {
    if (isOpen) {
      setSelectedIndex(initialIndex);
    }
  }, [isOpen, initialIndex]);

  const currentItem = items[selectedIndex];

  if (!currentItem) {
    return null;
  }

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => !open && onClose()}
      title={title}
      size="xl"
      className="h-[80vh] flex flex-col p-0 overflow-hidden"
    >
      <div className="flex flex-1 h-full min-h-0">
        {/* Sidebar List (if multiple) */}
        {items.length > 1 && (
          <div className="w-64 border-r border-border/10 bg-surface-2/10 flex flex-col overflow-y-auto scrollbar-auto-hide">
            <div className="px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">
              {items.length} Items
            </div>
            <div className="flex flex-col gap-0.5 p-2">
              {items.map((item, idx) => {
                const isActive = idx === selectedIndex;
                const Icon =
                  item.type === "image" ? ImageIcon : item.type === "link" ? LinkIcon : FileText;

                return (
                  <button
                    type="button"
                    key={item.id}
                    onClick={() => setSelectedIndex(idx)}
                    className={cn(
                      "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-left transition-colors duration-fast",
                      isActive
                        ? "bg-surface-2 text-foreground font-medium shadow-sm"
                        : "text-muted-foreground hover:bg-surface-2/50 hover:text-foreground"
                    )}
                  >
                    <Icon className="w-4 h-4 shrink-0" />
                    <span className="truncate">{item.title}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Preview Pane using shared component */}
        <ArtifactView item={currentItem} />
      </div>
    </Dialog>
  );
}
