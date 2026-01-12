/**
 * COLLAB-002: Conflict Resolution UI for Annotation Conflicts
 *
 * Provides a modal interface for resolving conflicting annotations
 * from concurrent edits by multiple users.
 */

import { cn } from "@/lib/utils";
import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, Check, Clock, GitMerge, User, X } from "lucide-react";
import { createPortal } from "react-dom";

export interface ConflictingAnnotation {
  id: string;
  userId: string;
  userName: string;
  userColor: string;
  timestamp: number;
  spanText: string;
  kind: string;
}

export interface AnnotationConflict {
  blockId: string;
  originalText: string;
  local: ConflictingAnnotation;
  remote: ConflictingAnnotation;
}

export type ConflictResolution = "keep_local" | "keep_remote" | "keep_both" | "discard_both";

export interface ConflictResolutionModalProps {
  conflict: AnnotationConflict | null;
  onResolve: (resolution: ConflictResolution) => void;
  onClose: () => void;
}

export function ConflictResolutionModal({
  conflict,
  onResolve,
  onClose,
}: ConflictResolutionModalProps) {
  if (!conflict) {
    return null;
  }

  const formatTime = (ts: number) => {
    const date = new Date(ts);
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  return createPortal(
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
          className="w-full max-w-md bg-surface-1/95 backdrop-blur-xl rounded-xl shadow-2xl border border-border/40 overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border/40 bg-accent-amber/5">
            <div className="flex items-center gap-2 text-accent-amber">
              <AlertTriangle className="w-4 h-4" />
              <span className="font-semibold text-sm">Annotation Conflict</span>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-1 hover:bg-surface-2 rounded transition-colors text-muted-foreground hover:text-foreground cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Context */}
          <div className="px-4 py-3 border-b border-border/40 bg-surface-2/30">
            <div className="text-xs text-muted-foreground mb-1">Affected text:</div>
            <div className="text-sm font-medium bg-surface-1 px-2 py-1.5 rounded border border-border/50 text-foreground/90 truncate font-mono">
              "{conflict.originalText}"
            </div>
          </div>

          {/* Conflicting Versions */}
          <div className="p-4 space-y-3">
            {/* Local Version */}
            <div className="p-3 rounded-lg border border-border/60 bg-surface-2/50 hover:bg-surface-2 transition-colors">
              <div className="flex items-center gap-2 mb-2">
                <div
                  className="w-2 h-2 rounded-full ring-2 ring-white/10"
                  style={{ backgroundColor: conflict.local.userColor }}
                />
                <span className="text-xs font-medium text-foreground">
                  {conflict.local.userName} (You)
                </span>
                <div className="flex items-center gap-1 text-xs text-muted-foreground ml-auto">
                  <Clock className="w-3 h-3" />
                  {formatTime(conflict.local.timestamp)}
                </div>
              </div>
              <div className="text-sm text-foreground/80 pl-4 border-l-2 border-primary/20">
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  {conflict.local.kind}:
                </span>{" "}
                {conflict.local.spanText}
              </div>
            </div>

            {/* Remote Version */}
            <div className="p-3 rounded-lg border border-border/60 bg-surface-2/50 hover:bg-surface-2 transition-colors">
              <div className="flex items-center gap-2 mb-2">
                <div
                  className="w-2 h-2 rounded-full ring-2 ring-white/10"
                  style={{ backgroundColor: conflict.remote.userColor }}
                />
                <span className="text-xs font-medium text-foreground">
                  {conflict.remote.userName}
                </span>
                <div className="flex items-center gap-1 text-xs text-muted-foreground ml-auto">
                  <Clock className="w-3 h-3" />
                  {formatTime(conflict.remote.timestamp)}
                </div>
              </div>
              <div className="text-sm text-foreground/80 pl-4 border-l-2 border-accent-indigo/20">
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  {conflict.remote.kind}:
                </span>{" "}
                {conflict.remote.spanText}
              </div>
            </div>
          </div>

          {/* Resolution Options */}
          <div className="p-4 border-t border-border/40 bg-surface-2/20 space-y-2">
            <div className="text-xs text-muted-foreground mb-2 font-medium">Choose resolution:</div>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => onResolve("keep_local")}
                className={cn(
                  "flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg transition-all cursor-pointer",
                  "bg-surface-1 border border-border shadow-sm hover:border-primary/50 hover:text-primary active:scale-[0.98]"
                )}
              >
                <Check className="w-3.5 h-3.5" />
                Keep Mine
              </button>
              <button
                type="button"
                onClick={() => onResolve("keep_remote")}
                className={cn(
                  "flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg transition-all cursor-pointer",
                  "bg-surface-1 border border-border shadow-sm hover:border-primary/50 hover:text-primary active:scale-[0.98]"
                )}
              >
                <User className="w-3.5 h-3.5" />
                Keep Theirs
              </button>
              <button
                type="button"
                onClick={() => onResolve("keep_both")}
                className={cn(
                  "flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg transition-all cursor-pointer",
                  "bg-primary text-primary-foreground shadow-sm hover:bg-primary/90 active:scale-[0.98]"
                )}
              >
                <GitMerge className="w-3.5 h-3.5" />
                Keep Both
              </button>
              <button
                type="button"
                onClick={() => onResolve("discard_both")}
                className={cn(
                  "flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg transition-all cursor-pointer",
                  "bg-surface-1 border border-transparent text-muted-foreground hover:bg-surface-2 hover:text-foreground"
                )}
              >
                <X className="w-3.5 h-3.5" />
                Discard Both
              </button>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>,
    document.body
  );
}
