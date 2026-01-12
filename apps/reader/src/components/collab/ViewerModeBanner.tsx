/**
 * ViewerModeBanner - Read-only mode indicator
 *
 * Shows a subtle banner when user is in viewer mode.
 */

"use client";

import { cn } from "@/lib/utils";
import { Eye, Mail } from "lucide-react";
import type * as React from "react";

import { Button } from "@/components/ui/Button";

interface ViewerModeBannerProps {
  /** Callback when user requests edit access */
  onRequestAccess?: () => void;
  /** Additional CSS classes */
  className?: string;
  /** Compact mode (less padding) */
  compact?: boolean;
}

/**
 * Banner indicating viewer (read-only) mode.
 */
export function ViewerModeBanner({
  onRequestAccess,
  className,
  compact = false,
}: ViewerModeBannerProps): React.ReactElement {
  return (
    <output
      data-testid="viewer-mode-banner"
      className={cn(
        "flex items-center justify-between gap-3 rounded-lg border border-border/40 bg-muted/50",
        compact ? "px-3 py-1.5" : "px-4 py-2.5",
        className
      )}
      aria-live="polite"
    >
      <div className="flex items-center gap-2">
        <Eye className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
        <span className={cn("text-muted-foreground", compact ? "text-xs" : "text-sm")}>
          View only — ask for edit access
        </span>
      </div>

      {onRequestAccess && (
        <Button
          type="button"
          variant="ghost"
          size={compact ? "compact" : "sm"}
          onClick={onRequestAccess}
          className="shrink-0"
        >
          <Mail className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
          Request access
        </Button>
      )}
    </output>
  );
}

/**
 * Inline viewer indicator for header integration.
 */
export function ViewerModeIndicator({
  className,
}: {
  className?: string;
}): React.ReactElement {
  return (
    <div
      data-testid="viewer-mode-indicator"
      className={cn(
        "flex items-center gap-1.5 rounded-full border border-border/40 bg-muted/50 px-2.5 py-1 text-xs text-muted-foreground",
        className
      )}
    >
      <Eye className="h-3 w-3" aria-hidden="true" />
      <span>View only</span>
    </div>
  );
}
