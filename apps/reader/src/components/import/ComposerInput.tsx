"use client";

/**
 * ComposerInput - Linear-style magic input
 *
 * Design Philosophy:
 * - Minimal chrome, maximum content focus
 * - Subtle hover states with precise timing
 * - Keyboard-first interaction hints
 * - Progressive disclosure of actions
 */

import { cn } from "@/lib/utils";
import { AnimatePresence, motion } from "framer-motion";
import { FileText, Globe, Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";
import { forwardRef } from "react";
import type { SourceKind } from "./types";

// Linear-style spring config: fast and responsive
const SPRING = { type: "spring", stiffness: 600, damping: 40 } as const;

interface ComposerInputProps {
  value: string;
  onChange: (value: string) => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  onAdd: () => void;
  onFileSelect: () => void;
  isDragOver: boolean;
  detectedKind: SourceKind;
}

export const ComposerInput = forwardRef<HTMLTextAreaElement, ComposerInputProps>(
  ({ value, onChange, onKeyDown, onFileSelect, isDragOver, detectedKind }, ref) => {
    const t = useTranslations("Import");
    const hasValue = value.trim().length > 0;

    // Auto-resize textarea
    const adjustHeight = (el: HTMLTextAreaElement) => {
      el.style.height = "auto";
      el.style.height = `${Math.min(el.scrollHeight, 180)}px`;
    };

    return (
      <div
        className={cn(
          "relative group rounded-lg transition-all duration-200",
          // Minimal surface with subtle elevation
          "bg-surface-1/50 hover:bg-surface-1/80",
          "border border-border/50 hover:border-border/80",
          "focus-within:bg-surface-1 focus-within:border-primary/30",
          "focus-within:shadow-[0_0_0_1px_rgba(var(--primary-rgb),0.1)]",
          isDragOver && "opacity-0 pointer-events-none"
        )}
      >
        {/* Input Area */}
        <div className="px-4 pt-4 pb-2">
          <textarea
            ref={ref}
            value={value}
            onChange={(e) => {
              onChange(e.target.value);
              adjustHeight(e.target);
            }}
            onKeyDown={onKeyDown}
            placeholder={t("placeholder") ?? "Paste a link, text, or drop files..."}
            className={cn(
              "w-full min-h-[56px] max-h-[180px] resize-none",
              "bg-transparent text-[14px] leading-relaxed text-foreground",
              "placeholder:text-muted-foreground/40",
              "focus:outline-none"
            )}
            rows={1}
            aria-label={t("inputLabel") ?? "Import content"}
          />
        </div>

        {/* Footer - Always visible for context */}
        <div className="flex items-center justify-between px-3 pb-3 pt-1">
          {/* Left: File upload */}
          <button
            type="button"
            onClick={onFileSelect}
            className={cn(
              "flex items-center gap-1.5 px-2.5 py-1.5 -ml-1 rounded-md",
              "text-[12px] font-medium text-muted-foreground/70",
              "hover:bg-surface-2 hover:text-foreground",
              "transition-colors duration-150"
            )}
            aria-label={t("uploadFile") ?? "Upload file"}
          >
            <FileText className="h-3.5 w-3.5" aria-hidden="true" />
            <span className="hidden sm:inline">{t("file") ?? "File"}</span>
          </button>

          {/* Right: Type indicator + keyboard hint */}
          <div className="flex items-center gap-2">
            {/* Type Detection Badge */}
            <AnimatePresence mode="wait">
              {hasValue && (
                <motion.div
                  key={detectedKind}
                  initial={{ opacity: 0, x: 8, scale: 0.9 }}
                  animate={{ opacity: 1, x: 0, scale: 1 }}
                  exit={{ opacity: 0, x: -8, scale: 0.9 }}
                  transition={SPRING}
                  className={cn(
                    "flex items-center gap-1.5 px-2 py-1 rounded-md",
                    "text-[11px] font-medium uppercase tracking-wide",
                    detectedKind === "url"
                      ? "bg-blue-500/10 text-blue-500"
                      : "bg-amber-500/10 text-amber-500"
                  )}
                >
                  {detectedKind === "url" ? (
                    <>
                      <Globe className="w-3 h-3" aria-hidden="true" />
                      <span>Link</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-3 h-3" aria-hidden="true" />
                      <span>Text</span>
                    </>
                  )}
                </motion.div>
              )}
            </AnimatePresence>

            {/* Keyboard hint - fades in when has value */}
            <AnimatePresence>
              {hasValue && (
                <motion.kbd
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.15 }}
                  className={cn(
                    "hidden sm:flex items-center gap-1",
                    "px-1.5 py-0.5 rounded",
                    "bg-surface-2/80 border border-border/50",
                    "text-[10px] font-medium text-muted-foreground/60"
                  )}
                >
                  <span>⏎</span>
                </motion.kbd>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    );
  }
);

ComposerInput.displayName = "ComposerInput";
