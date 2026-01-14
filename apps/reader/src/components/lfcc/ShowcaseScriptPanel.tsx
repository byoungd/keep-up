"use client";

import { Button } from "@/components/ui/Button";
import { cn } from "@ku0/shared/utils";
import { ChevronDown, ChevronRight, RefreshCw } from "lucide-react";
import * as React from "react";

export type ShowcaseScriptPanelProps = {
  onReset?: () => void;
  className?: string;
};

/**
 * Collapsible panel for demo showcase scripts.
 * Dev-only component for debugging and reset functionality.
 */
export function ShowcaseScriptPanel({ onReset, className }: ShowcaseScriptPanelProps) {
  const [isOpen, setIsOpen] = React.useState(false);
  const isDev = process.env.NODE_ENV !== "production";

  if (!isDev) {
    return null;
  }

  return (
    <div
      className={cn(
        "pointer-events-auto rounded-xl border border-border/50 bg-surface-0/95 shadow-sm backdrop-blur-md overflow-hidden",
        "dark:bg-surface-1/90",
        className
      )}
    >
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "flex w-full items-center gap-2 px-4 py-2",
          "text-xs font-medium text-muted-foreground",
          "hover:bg-surface-2/60 transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
          isOpen && "border-b border-border/40"
        )}
      >
        {isOpen ? (
          <ChevronDown className="h-3.5 w-3.5" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5" />
        )}
        <span>Showcase Script</span>
        <span className="ml-auto rounded-full bg-accent-amber/15 px-2 py-0.5 text-[10px] text-accent-amber">
          DEV
        </span>
      </button>

      {isOpen && (
        <div className="px-4 pb-3 pt-1 space-y-3">
          <p className="text-xs text-muted-foreground leading-relaxed">
            This demo showcases the LFCC annotation system with strict mapping, multi-block
            highlights, and drag handles.
          </p>

          <div className="flex items-center gap-2">
            {onReset && (
              <Button variant="outline" size="sm" onClick={onReset} className="h-7 text-xs gap-1">
                <RefreshCw className="h-3 w-3" />
                Reset demo content
              </Button>
            )}
          </div>

          <div className="text-[10px] text-muted-foreground/60 space-y-1">
            <p>• Select text to create annotations</p>
            <p>• Drag handles to adjust ranges</p>
            <p>• Check Issues tab for fail-closed states</p>
          </div>
        </div>
      )}
    </div>
  );
}
