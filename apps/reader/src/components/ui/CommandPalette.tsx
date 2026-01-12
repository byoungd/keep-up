"use client";

import { type CommandAction, useCommandPaletteLogic } from "@/hooks/useCommandPaletteLogic";
import { useReducedMotion } from "@/lib/animations/useReducedMotion";
import { cn } from "@/lib/utils";
import { Command } from "cmdk";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, Search } from "lucide-react";
import { useCallback, useEffect } from "react";
import { createPortal } from "react-dom";

export type { CommandAction };

type CommandPaletteProps = {
  /** Additional actions to include in the palette */
  additionalActions?: CommandAction[];
  /** Callback when a search is performed (for doc search) */
  onSearch?: (query: string) => void;
};

/** Spring physics for snappy but natural motion */
const springTransition = {
  type: "spring" as const,
  stiffness: 500,
  damping: 35,
};

/** Stagger delay for item animations (fast, barely perceptible) */
const STAGGER_DELAY = 0.03;

/**
 * Command Palette (Cmd+K)
 *
 * A global command palette for quick actions, navigation, and search.
 * Follows the Notion/Linear/VS Code pattern for keyboard-first workflows.
 */
export function CommandPalette({ additionalActions = [], onSearch }: CommandPaletteProps) {
  const {
    isOpen,
    setIsOpen,
    query,
    setQuery,
    sortedSections,
    groupedActions,
    handleSelect,
    handleSearchSubmit,
  } = useCommandPaletteLogic({ additionalActions, onSearch });

  const prefersReducedMotion = useReducedMotion();

  useEffect(() => {
    const handleOpen = (event: Event) => {
      const detail = (event as CustomEvent<{ query?: string }>).detail;
      setIsOpen(true);
      if (detail?.query !== undefined) {
        setQuery(detail.query);
      }
    };

    window.addEventListener("open-command-palette", handleOpen as EventListener);
    return () => window.removeEventListener("open-command-palette", handleOpen as EventListener);
  }, [setIsOpen, setQuery]);

  if (typeof window === "undefined") {
    return null;
  }

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop with enhanced blur */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={
              prefersReducedMotion ? { duration: 0.1 } : { duration: 0.2, ease: "easeOut" }
            }
            className="fixed inset-0 z-overlay bg-background/70 backdrop-blur-md"
            onClick={() => setIsOpen(false)}
            aria-hidden="true"
          />

          {/* Command Palette with spring animation */}
          <motion.div
            initial={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, scale: 0.95, y: -20 }}
            animate={prefersReducedMotion ? { opacity: 1 } : { opacity: 1, scale: 1, y: 0 }}
            exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, scale: 0.95, y: -10 }}
            transition={prefersReducedMotion ? { duration: 0.1 } : springTransition}
            className="fixed left-1/2 top-[15%] z-101 w-full max-w-xl -translate-x-1/2 px-4 md:px-0"
          >
            <Command
              className={cn(
                "overflow-hidden rounded-xl border border-border/40 shadow-2xl",
                "bg-surface-1/95 backdrop-blur-xl",
                "ring-1 ring-black/5 dark:ring-white/10"
              )}
              label="Command Palette"
              data-testid="command-palette"
              loop
            >
              {/* Search Input */}
              <div className="flex items-center border-b border-border/40 px-4 py-3">
                <Search className="mr-3 h-4 w-4 shrink-0 text-muted-foreground" />
                <Command.Input
                  autoFocus
                  placeholder="Search commands, actions, or documents..."
                  value={query}
                  onValueChange={setQuery}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") {
                      e.preventDefault();
                      setIsOpen(false);
                      return;
                    }
                    if (e.key === "Enter" && query.trim() && onSearch) {
                      handleSearchSubmit();
                    }
                  }}
                  className="flex h-6 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground/60 text-foreground"
                  aria-label="Command input"
                />
                <kbd className="hidden sm:flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground bg-surface-2 rounded border border-border/20">
                  ESC
                </kbd>
              </div>

              {/* Command List */}
              <Command.List className="max-h-[400px] overflow-y-auto p-2 scroll-smooth">
                <Command.Empty className="py-8 text-center text-sm text-muted-foreground flex flex-col items-center gap-2">
                  <Search className="h-5 w-5 text-muted-foreground/50" />
                  <span>No results found</span>
                  {onSearch && query.trim() && (
                    <button
                      type="button"
                      onClick={handleSearchSubmit}
                      className="mt-2 flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-surface-2 hover:bg-surface-3 transition-colors text-foreground"
                    >
                      <Search className="h-3 w-3" />
                      Search documents for "{query}"
                    </button>
                  )}
                </Command.Empty>

                {sortedSections.map((section, sectionIndex) => (
                  <Command.Group key={section} heading={section}>
                    <div className="px-2 py-1.5 text-[10px] font-semibold text-muted-foreground/70 uppercase tracking-wider">
                      {section}
                    </div>
                    {groupedActions[section].map((action, actionIndex) => (
                      <CommandItem
                        key={action.id}
                        action={action}
                        onSelect={() => handleSelect(action)}
                        index={sectionIndex * 10 + actionIndex}
                        prefersReducedMotion={prefersReducedMotion}
                      />
                    ))}
                  </Command.Group>
                ))}
              </Command.List>

              {/* Footer */}
              <div className="flex items-center justify-between border-t border-border/40 px-4 py-2 text-[10px] text-muted-foreground">
                <div className="flex items-center gap-3">
                  <span className="flex items-center gap-1">
                    <kbd className="px-1 py-0.5 bg-surface-2 rounded border border-border/20">
                      ↑↓
                    </kbd>
                    Navigate
                  </span>
                  <span className="flex items-center gap-1">
                    <kbd className="px-1 py-0.5 bg-surface-2 rounded border border-border/20">
                      ↵
                    </kbd>
                    Select
                  </span>
                </div>
                <span className="flex items-center gap-1">
                  <kbd className="px-1 py-0.5 bg-surface-2 rounded border border-border/20">
                    Cmd
                  </kbd>
                  <kbd className="px-1 py-0.5 bg-surface-2 rounded border border-border/20">K</kbd>
                  Toggle
                </span>
              </div>
            </Command>
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body
  );
}

function CommandItem({
  action,
  onSelect,
  index,
  prefersReducedMotion,
}: {
  action: CommandAction;
  onSelect: () => void;
  index: number;
  prefersReducedMotion: boolean;
}) {
  const Icon = action.icon || ArrowRight;

  return (
    <motion.div
      initial={prefersReducedMotion ? {} : { opacity: 0, x: -8 }}
      animate={prefersReducedMotion ? {} : { opacity: 1, x: 0 }}
      transition={
        prefersReducedMotion
          ? {}
          : {
              delay: index * STAGGER_DELAY,
              duration: 0.15,
              ease: [0.4, 0, 0.2, 1],
            }
      }
    >
      <Command.Item
        value={`${action.label} ${action.description || ""}`}
        onSelect={onSelect}
        className={cn(
          "relative flex cursor-pointer select-none items-center gap-3 rounded-lg px-3 py-2.5 text-sm outline-none transition-colors",
          "text-foreground",
          "data-[selected=true]:bg-primary/10 data-[selected=true]:text-primary",
          "hover:bg-surface-2"
        )}
      >
        <div
          className={cn(
            "flex h-8 w-8 shrink-0 items-center justify-center rounded-md transition-colors",
            "bg-surface-2 text-muted-foreground",
            "group-data-[selected=true]:bg-primary/20 group-data-[selected=true]:text-primary"
          )}
        >
          <Icon className="h-4 w-4" />
        </div>
        <div className="flex flex-1 flex-col">
          <span className="font-medium">{action.label}</span>
          {action.description && (
            <span className="text-xs text-muted-foreground/80 group-data-[selected=true]:text-primary/80">
              {action.description}
            </span>
          )}
        </div>
        {action.shortcut && (
          <div className="flex items-center gap-1">
            {action.shortcut.map((key, i) => (
              <kbd
                key={`${action.id}-shortcut-${i}`}
                className="px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground bg-surface-2 rounded border border-border/20 group-data-[selected=true]:bg-primary/10 group-data-[selected=true]:text-primary"
              >
                {key}
              </kbd>
            ))}
          </div>
        )}
      </Command.Item>
    </motion.div>
  );
}

/**
 * Hook to programmatically open the command palette
 */
export function useCommandPalette() {
  const open = useCallback((query?: string) => {
    window.dispatchEvent(
      new CustomEvent("open-command-palette", {
        detail: { query },
      })
    );
  }, []);

  return { open };
}
