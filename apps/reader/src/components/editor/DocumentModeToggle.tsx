/**
 * DocumentModeToggle - Switch between Chat and Document modes
 *
 * Premium Linear-quality UI for mode switching with:
 * - Animated toggle transition
 * - Mode indicator icons
 * - Confirmation dialog for data safety
 */

"use client";

import { cn } from "@ku0/shared/utils";
import { ArrowRightLeft, FileText, MessageSquare } from "lucide-react";
import * as React from "react";

// ============================================================================
// Types
// ============================================================================

export type DocumentMode = "chat" | "document" | "hybrid";

interface DocumentModeToggleProps {
  /** Current mode */
  mode: DocumentMode;
  /** Callback when mode changes */
  onModeChange: (mode: DocumentMode) => void;
  /** Whether conversion is in progress */
  isConverting?: boolean;
  /** Disabled state */
  disabled?: boolean;
  /** Additional class names */
  className?: string;
}

// ============================================================================
// Component
// ============================================================================

export function DocumentModeToggle({
  mode,
  onModeChange,
  isConverting = false,
  disabled = false,
  className,
}: DocumentModeToggleProps) {
  const [showConfirm, setShowConfirm] = React.useState(false);
  const [pendingMode, setPendingMode] = React.useState<DocumentMode | null>(null);

  const handleModeClick = (newMode: DocumentMode) => {
    if (disabled || isConverting || newMode === mode) {
      return;
    }

    // Show confirmation for mode changes that may alter content
    if (mode === "chat" && newMode === "document") {
      setPendingMode(newMode);
      setShowConfirm(true);
    } else if (mode === "document" && newMode === "chat") {
      setPendingMode(newMode);
      setShowConfirm(true);
    } else {
      onModeChange(newMode);
    }
  };

  const confirmChange = () => {
    if (pendingMode) {
      onModeChange(pendingMode);
    }
    setShowConfirm(false);
    setPendingMode(null);
  };

  const cancelChange = () => {
    setShowConfirm(false);
    setPendingMode(null);
  };

  return (
    <div className={cn("relative", className)}>
      {/* Toggle Container */}
      <div className="flex items-center gap-1 p-1 rounded-lg bg-surface-2/50 border border-border/30">
        {/* Chat Mode Button */}
        <button
          type="button"
          onClick={() => handleModeClick("chat")}
          disabled={disabled || isConverting}
          className={cn(
            "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all duration-200",
            mode === "chat"
              ? "bg-primary text-primary-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground hover:bg-surface-3/50"
          )}
        >
          <MessageSquare className="w-4 h-4" />
          <span>Chat</span>
        </button>

        {/* Hybrid Mode Button (optional middle state) */}
        {mode === "hybrid" && (
          <button
            type="button"
            disabled={disabled || isConverting}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium bg-gradient-to-r from-primary to-violet-500 text-white shadow-sm"
          >
            <ArrowRightLeft className="w-4 h-4" />
            <span>Hybrid</span>
          </button>
        )}

        {/* Document Mode Button */}
        <button
          type="button"
          onClick={() => handleModeClick("document")}
          disabled={disabled || isConverting}
          className={cn(
            "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all duration-200",
            mode === "document"
              ? "bg-primary text-primary-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground hover:bg-surface-3/50"
          )}
        >
          <FileText className="w-4 h-4" />
          <span>Document</span>
        </button>
      </div>

      {/* Confirmation Dialog */}
      {showConfirm && (
        <div className="absolute top-full left-0 mt-2 z-50 w-64 p-4 rounded-xl bg-surface-1 border border-border shadow-lg">
          <h4 className="text-sm font-semibold mb-2">Switch Mode?</h4>
          <p className="text-xs text-muted-foreground mb-4">
            {pendingMode === "document"
              ? "This will convert chat messages into editable document blocks. User messages will become quotes."
              : "This will convert document blocks into a chat conversation. All blocks will become assistant messages."}
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={cancelChange}
              className="flex-1 px-3 py-1.5 text-xs font-medium rounded-md border border-border hover:bg-surface-2 transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={confirmChange}
              className="flex-1 px-3 py-1.5 text-xs font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              Convert
            </button>
          </div>
        </div>
      )}

      {/* Converting Overlay */}
      {isConverting && (
        <div className="absolute inset-0 flex items-center justify-center bg-surface-1/80 rounded-lg">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            <span>Converting...</span>
          </div>
        </div>
      )}
    </div>
  );
}

export default DocumentModeToggle;
