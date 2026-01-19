"use client";

import { cn } from "@ku0/shared/utils";
import * as FocusScope from "@radix-ui/react-focus-scope";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import * as React from "react";
import { createPortal } from "react-dom";

export interface SheetProps {
  /** Whether the sheet is open */
  open: boolean;
  /** Called when sheet should close */
  onOpenChange: (open: boolean) => void;
  /** Sheet title for accessibility */
  title?: string;
  /** Sheet content */
  children: React.ReactNode;
  /** Side to appear from */
  side?: "left" | "right";
  /** Width of the sheet */
  width?: string;
  /** Whether to show backdrop (blocking mode) */
  showBackdrop?: boolean;
  /** Whether clicking backdrop closes the sheet */
  closeOnBackdropClick?: boolean;
  /** Whether ESC key closes the sheet */
  closeOnEsc?: boolean;
  /** Show close button */
  showCloseButton?: boolean;
}

const SLIDE_VARIANTS = {
  left: {
    initial: { x: "-100%" },
    animate: { x: 0 },
    exit: { x: "-100%" },
  },
  right: {
    initial: { x: "100%" },
    animate: { x: 0 },
    exit: { x: "100%" },
  },
} as const;

/**
 * Sheet component for side panels with robust accessibility.
 *
 * Deep Optimizations:
 * - Focus trapping via Radix
 * - Unique IDs
 * - Conditional focus trapping (only for blocking/backdrop mode)
 */
export function Sheet({
  open,
  onOpenChange,
  title,
  children,
  side = "right",
  width = "320px",
  showBackdrop = true,
  closeOnBackdropClick = true,
  closeOnEsc = true,
  showCloseButton = true,
}: SheetProps) {
  const sheetId = React.useId();
  const titleId = `${sheetId}-title`;

  // Handle ESC key
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

  // Lock body scroll only if backdrop is shown
  React.useEffect(() => {
    if (open && showBackdrop) {
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = originalOverflow;
      };
    }
  }, [open, showBackdrop]);

  if (typeof window === "undefined") {
    return null;
  }

  const variants = SLIDE_VARIANTS[side];

  // Conditionally wrap in FocusScope if it's a blocking sheet
  const Wrapper = showBackdrop ? FocusScope.Root : React.Fragment;
  const wrapperProps = showBackdrop ? { trapped: true, asChild: true } : {};

  return createPortal(
    <AnimatePresence>
      {open && (
        <Wrapper {...wrapperProps}>
          <div
            className={cn(
              "fixed inset-0 z-overlay flex pointer-events-none",
              side === "right" ? "justify-end" : "justify-start"
            )}
          >
            {/* Backdrop (optional) */}
            {showBackdrop && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="absolute inset-0 bg-background/40 backdrop-blur-sm pointer-events-auto"
                onClick={closeOnBackdropClick ? () => onOpenChange(false) : undefined}
                aria-hidden="true"
              />
            )}

            {/* Sheet */}
            <motion.div
              role="dialog"
              aria-modal={showBackdrop}
              aria-label={title}
              aria-labelledby={title ? titleId : undefined}
              initial={variants.initial}
              animate={variants.animate}
              exit={variants.exit}
              transition={{ duration: 0.25, ease: [0.32, 0.72, 0, 1] }}
              style={{ width }}
              className={cn(
                "relative h-full flex flex-col pointer-events-auto",
                "bg-surface-1 border-border/40 shadow-2xl",
                side === "left" ? "border-r" : "border-l"
              )}
              tabIndex={-1}
            >
              {/* Header */}
              {(title || showCloseButton) && (
                <div className="flex items-center justify-between gap-4 border-b border-border/40 px-4 py-3 shrink-0">
                  {title && (
                    <h2 id={titleId} className="text-sm font-semibold text-foreground truncate">
                      {title}
                    </h2>
                  )}
                  {showCloseButton && (
                    <button
                      type="button"
                      onClick={() => onOpenChange(false)}
                      className="shrink-0 rounded-md p-1.5 text-muted-foreground hover:text-foreground hover:bg-surface-2 transition-colors duration-fast ml-auto"
                      aria-label="Close panel"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>
              )}

              {/* Content */}
              <div className="flex-1 overflow-y-auto scrollbar-auto-hide">{children}</div>
            </motion.div>
          </div>
        </Wrapper>
      )}
    </AnimatePresence>,
    document.body
  );
}
