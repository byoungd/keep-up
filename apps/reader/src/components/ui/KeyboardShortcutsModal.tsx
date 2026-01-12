"use client";

import { useKeyboardShortcuts } from "@/context/KeyboardShortcutsContext";
import { useReducedMotion } from "@/lib/animations/useReducedMotion";
import { cn } from "@/lib/utils";
import * as FocusScope from "@radix-ui/react-focus-scope";
import { AnimatePresence, motion } from "framer-motion";
import { Keyboard, Search, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";

/** Section order for display */
const SECTION_ORDER = ["Quick Actions", "Navigation", "Annotations", "AI", "Appearance", "Help"];

/** Spring physics for modal animation */
const springTransition = {
  type: "spring" as const,
  stiffness: 500,
  damping: 35,
};

interface KeyboardShortcutsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

/**
 * Keyboard Shortcuts Modal (Cmd+/)
 *
 * Displays all registered keyboard shortcuts grouped by section.
 * Follows Linear's minimal, keyboard-first design philosophy.
 */
export function KeyboardShortcutsModal({ isOpen, onClose }: KeyboardShortcutsModalProps) {
  const { shortcuts } = useKeyboardShortcuts();
  const prefersReducedMotion = useReducedMotion();
  const [searchQuery, setSearchQuery] = useState("");

  // Close on Escape
  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  // Reset search when closing
  useEffect(() => {
    if (!isOpen) {
      setSearchQuery("");
    }
  }, [isOpen]);

  // Filter shortcuts by search query
  const filteredShortcuts = useMemo(() => {
    if (!searchQuery.trim()) {
      return shortcuts;
    }
    const query = searchQuery.toLowerCase();
    return shortcuts.filter(
      (s) =>
        s.label.toLowerCase().includes(query) ||
        s.description?.toLowerCase().includes(query) ||
        s.keys.some((k) => k.toLowerCase().includes(query))
    );
  }, [shortcuts, searchQuery]);

  // Group shortcuts by section
  const groupedShortcuts = useMemo(() => {
    const groups: Record<string, typeof shortcuts> = {};
    for (const shortcut of filteredShortcuts) {
      const section = shortcut.section || "Other";
      if (!groups[section]) {
        groups[section] = [];
      }
      groups[section].push(shortcut);
    }
    return groups;
  }, [filteredShortcuts]);

  // Sort sections by predefined order
  const sortedSections = useMemo(() => {
    const sections = Object.keys(groupedShortcuts);
    return sections.sort((a, b) => {
      const indexA = SECTION_ORDER.indexOf(a);
      const indexB = SECTION_ORDER.indexOf(b);
      if (indexA === -1 && indexB === -1) {
        return a.localeCompare(b);
      }
      if (indexA === -1) {
        return 1;
      }
      if (indexB === -1) {
        return -1;
      }
      return indexA - indexB;
    });
  }, [groupedShortcuts]);

  if (typeof window === "undefined") {
    return null;
  }

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={prefersReducedMotion ? { duration: 0.1 } : { duration: 0.2 }}
            className="fixed inset-0 z-overlay bg-background/70 backdrop-blur-md"
            onClick={onClose}
            aria-hidden="true"
          />

          <FocusScope.Root trapped loop asChild>
            {/* biome-ignore lint/a11y/useSemanticElements: motion.div needed for animations */}
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-labelledby="keyboard-shortcuts-title"
              initial={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, scale: 0.95, y: -20 }}
              animate={prefersReducedMotion ? { opacity: 1 } : { opacity: 1, scale: 1, y: 0 }}
              exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, scale: 0.95, y: -10 }}
              transition={prefersReducedMotion ? { duration: 0.1 } : springTransition}
              className="fixed left-1/2 top-[10%] z-101 w-full max-w-lg -translate-x-1/2 px-4 md:px-0"
              tabIndex={-1}
            >
              <div
                className={cn(
                  "overflow-hidden rounded-xl border border-border/40 shadow-2xl",
                  "bg-surface-1/95 backdrop-blur-xl",
                  "ring-1 ring-black/5 dark:ring-white/10"
                )}
              >
                {/* Header */}
                <div className="flex items-center justify-between border-b border-border/40 px-4 py-3">
                  <div className="flex items-center gap-2">
                    <Keyboard className="h-4 w-4 text-muted-foreground" />
                    <h2
                      id="keyboard-shortcuts-title"
                      className="text-sm font-semibold text-foreground"
                    >
                      Keyboard Shortcuts
                    </h2>
                  </div>
                  <button
                    type="button"
                    onClick={onClose}
                    className="rounded-md p-1 text-muted-foreground hover:bg-surface-2 hover:text-foreground transition-colors"
                    aria-label="Close"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                {/* Search */}
                <div className="flex items-center border-b border-border/40 px-4 py-2">
                  <Search className="mr-3 h-4 w-4 shrink-0 text-muted-foreground" />
                  <input
                    type="text"
                    placeholder="Search shortcuts..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="flex h-6 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground/60 text-foreground"
                    // biome-ignore lint/a11y/noAutofocus: modal search needs focus for UX
                    autoFocus
                  />
                </div>

                {/* Shortcuts List */}
                <div className="max-h-[60vh] overflow-y-auto p-3">
                  {sortedSections.length === 0 ? (
                    <div className="py-8 text-center text-sm text-muted-foreground">
                      No shortcuts found
                    </div>
                  ) : (
                    sortedSections.map((section) => (
                      <div key={section} className="mb-4 last:mb-0">
                        <div className="px-2 py-1.5 text-[10px] font-semibold text-muted-foreground/70 uppercase tracking-wider">
                          {section}
                        </div>
                        <div className="space-y-0.5">
                          {groupedShortcuts[section].map((shortcut) => (
                            <ShortcutRow key={shortcut.id} shortcut={shortcut} />
                          ))}
                        </div>
                      </div>
                    ))
                  )}
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between border-t border-border/40 px-4 py-2 text-[10px] text-muted-foreground">
                  <span>Press a shortcut to close and execute</span>
                  <kbd className="px-1.5 py-0.5 bg-surface-2 rounded border border-border/20">
                    ESC
                  </kbd>
                </div>
              </div>
            </motion.div>
          </FocusScope.Root>
        </>
      )}
    </AnimatePresence>,
    document.body
  );
}

function ShortcutRow({
  shortcut,
}: { shortcut: { id: string; label: string; keys: string[]; description?: string } }) {
  return (
    <div
      className={cn(
        "flex items-center justify-between rounded-md px-2 py-1.5",
        "hover:bg-surface-2 transition-colors"
      )}
    >
      <div className="flex flex-col">
        <span className="text-sm font-medium text-foreground">{shortcut.label}</span>
        {shortcut.description && (
          <span className="text-xs text-muted-foreground">{shortcut.description}</span>
        )}
      </div>
      <div className="flex items-center gap-1">
        {shortcut.keys.map((key, i) => (
          <kbd
            key={`${shortcut.id}-key-${i.toString()}`}
            className={cn(
              "min-w-[20px] px-1.5 py-0.5 text-[10px] font-medium text-center",
              "text-muted-foreground bg-surface-2 rounded border border-border/30"
            )}
          >
            {formatKey(key)}
          </kbd>
        ))}
      </div>
    </div>
  );
}

/** Format key for display (e.g., "cmd" -> "⌘") */
function formatKey(key: string): string {
  const map: Record<string, string> = {
    cmd: "⌘",
    ctrl: "⌃",
    alt: "⌥",
    shift: "⇧",
    enter: "↵",
    escape: "Esc",
    esc: "Esc",
    backspace: "⌫",
    delete: "⌦",
    tab: "⇥",
    space: "Space",
    arrowup: "↑",
    arrowdown: "↓",
    arrowleft: "←",
    arrowright: "→",
  };
  return map[key.toLowerCase()] || key.toUpperCase();
}

/**
 * Hook to manage keyboard shortcuts modal state
 */
export function useKeyboardShortcutsModal() {
  const [isOpen, setIsOpen] = useState(false);

  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);
  const toggle = useCallback(() => setIsOpen((prev) => !prev), []);

  return { isOpen, open, close, toggle };
}
