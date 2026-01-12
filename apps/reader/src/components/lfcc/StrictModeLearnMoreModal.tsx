"use client";
import { cn } from "@/lib/utils";
import { X } from "lucide-react";

export type StrictModeLearnMoreModalProps = {
  isOpen: boolean;
  onClose: () => void;
};

/**
 * Educational modal explaining strict mapping mode.
 * Shows when user clicks "Learn more" on fail-closed behaviors.
 */
export function StrictModeLearnMoreModal({ isOpen, onClose }: StrictModeLearnMoreModalProps) {
  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <button
        type="button"
        className="absolute inset-0 bg-background/60 backdrop-blur-sm cursor-pointer"
        onClick={onClose}
        onKeyDown={(e) => e.key === "Escape" && onClose()}
        tabIndex={0}
        aria-label="Close modal"
      />

      {/* Modal */}
      <dialog
        open
        className={cn(
          "relative z-10 w-full max-w-lg rounded-xl",
          "bg-surface-1/95 backdrop-blur-xl border border-border/40 shadow-xl",
          "animate-in fade-in-0 zoom-in-95 duration-200"
        )}
        aria-modal="true"
        aria-labelledby="strict-mode-title"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border/40 px-5 py-4">
          <h2 id="strict-mode-title" className="text-sm font-semibold text-foreground">
            Understanding Strict Mapping
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-muted-foreground hover:bg-surface-2 hover:text-foreground transition-colors cursor-pointer"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Content */}
        <div className="px-5 py-4 space-y-4 text-sm text-foreground/90">
          <p>
            <strong className="text-foreground">Strict mode</strong> ensures annotations always
            point to the correct text. If a mapping can't be verified with certainty, the operation
            is blocked rather than guessing.
          </p>

          <div className="space-y-3">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Annotation States
            </h3>
            <dl className="space-y-2 text-xs">
              <div className="flex gap-2 items-start">
                <dt className="shrink-0 rounded-full bg-accent-emerald/15 px-2 py-0.5 font-medium text-accent-emerald">
                  Active
                </dt>
                <dd className="text-muted-foreground pt-0.5">
                  Fully verified and rendered correctly.
                </dd>
              </div>
              <div className="flex gap-2 items-start">
                <dt className="shrink-0 rounded-full bg-accent-amber/15 px-2 py-0.5 font-medium text-accent-amber">
                  Partial
                </dt>
                <dd className="text-muted-foreground pt-0.5">
                  Some spans are missing or out of order. Shows what it can.
                </dd>
              </div>
              <div className="flex gap-2 items-start">
                <dt className="shrink-0 rounded-full bg-accent-indigo/15 px-2 py-0.5 font-medium text-accent-indigo">
                  Unverified
                </dt>
                <dd className="text-muted-foreground pt-0.5">
                  Waiting for verification. Not rendered to avoid incorrect anchoring.
                </dd>
              </div>
              <div className="flex gap-2 items-start">
                <dt className="shrink-0 rounded-full bg-surface-3 px-2 py-0.5 font-medium text-muted-foreground">
                  Orphan
                </dt>
                <dd className="text-muted-foreground pt-0.5">
                  Original target deleted. Annotation preserved but not visible.
                </dd>
              </div>
            </dl>
          </div>

          <p className="text-xs text-muted-foreground">
            Check the <strong>Issues</strong> tab to see and manage annotations in non-ideal states.
          </p>
        </div>

        {/* Footer */}
        <div className="border-t border-border/40 px-5 py-3 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className={cn(
              "rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground shadow-sm",
              "hover:bg-primary/90 transition-all active:scale-95 cursor-pointer"
            )}
          >
            Got it
          </button>
        </div>
      </dialog>
    </div>
  );
}
