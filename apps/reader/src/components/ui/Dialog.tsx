"use client";

import { cn } from "@/lib/utils";
import * as FocusScope from "@radix-ui/react-focus-scope";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import * as React from "react";
import { createPortal } from "react-dom";

export interface DialogProps {
  /** Whether the dialog is open */
  open: boolean;
  /** Called when dialog should close */
  onOpenChange: (open: boolean) => void;
  /** Dialog title for accessibility */
  title: string;
  /** Optional description */
  description?: string;
  /** Dialog content */
  children: React.ReactNode;
  /** Size variant */
  size?: "sm" | "md" | "lg" | "xl";
  /** Whether clicking backdrop closes the dialog */
  closeOnBackdropClick?: boolean;
  /** Whether ESC key closes the dialog */
  closeOnEsc?: boolean;
  /** Show close button */
  showCloseButton?: boolean;
  /** Additional CSS classes for the dialog container */
  className?: string;
}

const SIZE_CLASSES = {
  sm: "max-w-sm",
  md: "max-w-md",
  lg: "max-w-lg",
  xl: "max-w-xl",
} as const;

/**
 * Modal Dialog component with robust accessibility features.
 *
 * Deep Optimizations:
 * - Uses @radix-ui/react-focus-scope for production-grade focus trapping
 * - Unique IDs for ARIA attributes via ensureUniqueId
 * - Robust ESC handling
 * - Scroll locking (via body style)
 */
export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  size = "md",
  closeOnBackdropClick = true,
  closeOnEsc = true,
  showCloseButton = true,
  className,
}: DialogProps) {
  const dialogId = React.useId();
  const titleId = `${dialogId}-title`;
  const descId = `${dialogId}-desc`;

  // Handle ESC key manually (FocusScope handles focus, but we need to control open state)
  React.useEffect(() => {
    if (!open || !closeOnEsc) {
      return;
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onOpenChange(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, closeOnEsc, onOpenChange]);

  // Lock body scroll
  React.useEffect(() => {
    if (open) {
      const originalOverflow = document.body.style.overflow;
      const originalPaddingRight = document.body.style.paddingRight;

      // Prevent layout shift by compensating for scrollbar
      const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
      document.body.style.overflow = "hidden";
      if (scrollbarWidth > 0) {
        document.body.style.paddingRight = `${scrollbarWidth}px`;
      }

      return () => {
        document.body.style.overflow = originalOverflow;
        document.body.style.paddingRight = originalPaddingRight;
      };
    }
  }, [open]);

  if (typeof window === "undefined") {
    return null;
  }

  return createPortal(
    <AnimatePresence>
      {open && (
        <FocusScope.Root trapped asChild>
          <div className="fixed inset-0 z-[100] flex items-center justify-center pointer-events-none">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="absolute inset-0 bg-background/60 backdrop-blur-sm pointer-events-auto"
              onClick={closeOnBackdropClick ? () => onOpenChange(false) : undefined}
              aria-hidden="true"
            />

            {/* Dialog Content */}
            {/* biome-ignore lint/a11y/useSemanticElements: Using motion.div for animation control */}
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-labelledby={titleId}
              aria-describedby={description ? descId : undefined}
              initial={{ opacity: 0, scale: 0.95, y: -10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: -10 }}
              transition={{ duration: 0.15, ease: [0.4, 0, 0.2, 1] }}
              className={cn("relative w-full p-4 pointer-events-auto", SIZE_CLASSES[size])}
              tabIndex={-1}
            >
              <div
                className={cn(
                  "relative overflow-hidden rounded-xl border border-border/40 shadow-2xl",
                  "bg-surface-1 backdrop-blur-xl",
                  "ring-1 ring-black/5 dark:ring-white/10",
                  className
                )}
              >
                {/* Header */}
                <div className="flex items-start justify-between gap-4 border-b border-border/40 px-6 py-4">
                  <div>
                    <h2 id={titleId} className="text-lg font-semibold text-foreground">
                      {title}
                    </h2>
                    {description && (
                      <p id={descId} className="mt-1 text-sm text-muted-foreground">
                        {description}
                      </p>
                    )}
                  </div>
                  {showCloseButton && (
                    <button
                      type="button"
                      onClick={() => onOpenChange(false)}
                      className="shrink-0 rounded-md p-1.5 text-muted-foreground hover:text-foreground hover:bg-surface-2 transition-colors"
                      aria-label="Close dialog"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>

                {/* Content */}
                <div className="px-6 py-4">{children}</div>
              </div>
            </motion.div>
          </div>
        </FocusScope.Root>
      )}
    </AnimatePresence>,
    document.body
  );
}

/** Dialog Footer for action buttons */
export function DialogFooter({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "flex items-center justify-end gap-3 border-t border-border/40 px-6 py-4 -mx-6 -mb-4 mt-4 bg-surface-2/30",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}
