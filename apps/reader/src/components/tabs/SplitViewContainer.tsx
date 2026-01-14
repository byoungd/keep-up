"use client";

import { type Tab, useTabContext } from "@/context/TabContext";
import { cn } from "@ku0/shared/utils";
import { X } from "lucide-react";
import * as React from "react";
import { TabBar } from "./TabBar";

// ============================================================================
// Types
// ============================================================================

interface SplitViewContainerProps {
  /** Render function for tab content */
  renderContent: (tab: Tab, paneIndex: number) => React.ReactNode;
  /** Optional empty state component */
  emptyState?: React.ReactNode;
  /** Class name for the container */
  className?: string;
}

// ============================================================================
// PaneContainer Component
// ============================================================================

interface PaneContainerProps {
  paneIndex: number;
  isActive: boolean;
  renderContent: (tab: Tab, paneIndex: number) => React.ReactNode;
  emptyState?: React.ReactNode;
  onFocus: () => void;
  onClose?: () => void;
  showCloseButton?: boolean;
}

function PaneContainer({
  paneIndex,
  isActive,
  renderContent,
  emptyState,
  onFocus,
  onClose,
  showCloseButton,
}: PaneContainerProps) {
  const { state, moveTab } = useTabContext();
  const pane = state.panes[paneIndex];
  const activeTab = pane?.tabs.find((t) => t.id === pane.activeTabId) ?? null;

  // Handle cross-pane drag and drop
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const data = e.dataTransfer.getData("text/plain");
    if (data) {
      try {
        const { tabId, fromPane } = JSON.parse(data) as { tabId: string; fromPane: number };
        if (fromPane !== paneIndex) {
          moveTab(tabId, fromPane, paneIndex);
        }
      } catch {
        // Invalid drag data
      }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      onFocus();
    }
  };

  return (
    <div
      className={cn(
        "flex flex-col h-full overflow-hidden relative",
        "transition-all duration-150",
        isActive
          ? "ring-2 ring-primary/30 ring-inset shadow-sm"
          : "ring-1 ring-border/30 ring-inset opacity-95"
      )}
      onClick={onFocus}
      onKeyDown={handleKeyDown}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {/* Active pane indicator bar */}
      {isActive && <div className="absolute top-0 left-0 right-0 h-0.5 bg-primary z-10" />}

      {/* Tab bar */}
      <TabBar paneIndex={paneIndex} />

      {/* Close pane button (split view only) */}
      {showCloseButton && onClose && (
        <button
          type="button"
          aria-label="Close this pane"
          onClick={onClose}
          className={cn(
            "absolute top-1 right-1 z-20 p-1 rounded-full",
            "bg-surface-2/80 hover:bg-surface-3 text-muted-foreground hover:text-foreground",
            "opacity-0 hover:opacity-100 focus:opacity-100 transition-opacity"
          )}
        >
          <X className="w-3.5 h-3.5" />
        </button>
      )}

      {/* Content area */}
      <div className="flex-1 overflow-hidden">
        {activeTab ? (
          <div className="h-full w-full overflow-auto">{renderContent(activeTab, paneIndex)}</div>
        ) : (
          (emptyState ?? (
            <div className="h-full w-full flex items-center justify-center text-muted-foreground">
              <p className="text-sm">No document selected</p>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// ============================================================================
// SplitViewContainer Component
// ============================================================================

export function SplitViewContainer({
  renderContent,
  emptyState,
  className,
}: SplitViewContainerProps) {
  const { state, setActivePane, setSplitRatio, closePane } = useTabContext();
  const { panes, activePaneIndex, splitRatio, splitDirection } = state;
  const isSplitView = panes.length > 1;

  // Resize handle state
  const containerRef = React.useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = React.useState(false);

  // Handle resize drag
  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!containerRef.current) {
        return;
      }

      const rect = containerRef.current.getBoundingClientRect();
      let ratio: number;

      if (splitDirection === "horizontal") {
        ratio = ((moveEvent.clientX - rect.left) / rect.width) * 100;
      } else {
        ratio = ((moveEvent.clientY - rect.top) / rect.height) * 100;
      }

      // Clamp between 20% and 80%
      ratio = Math.max(20, Math.min(80, ratio));
      setSplitRatio(ratio);
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    document.body.style.cursor = splitDirection === "horizontal" ? "col-resize" : "row-resize";
    document.body.style.userSelect = "none";
  };

  // Single pane view
  if (!isSplitView) {
    return (
      <div className={cn("h-full w-full", className)}>
        <PaneContainer
          paneIndex={0}
          isActive={true}
          renderContent={renderContent}
          emptyState={emptyState}
          onFocus={() => setActivePane(0)}
        />
      </div>
    );
  }

  // Split view
  const isHorizontal = splitDirection === "horizontal";

  return (
    <div
      ref={containerRef}
      className={cn("h-full w-full flex", isHorizontal ? "flex-row" : "flex-col", className)}
    >
      {/* First pane */}
      <div
        className="overflow-hidden"
        style={{
          [isHorizontal ? "width" : "height"]: `${splitRatio}%`,
          transition: isDragging ? "none" : "all 150ms ease-out",
        }}
      >
        <PaneContainer
          paneIndex={0}
          isActive={activePaneIndex === 0}
          renderContent={renderContent}
          emptyState={emptyState}
          onFocus={() => setActivePane(0)}
          showCloseButton
          onClose={() => closePane(0)}
        />
      </div>

      {/* Resize handle */}
      <div
        className={cn(
          "shrink-0 bg-border/50 hover:bg-primary/50 transition-colors z-10",
          isHorizontal ? "w-1 cursor-col-resize hover:w-1.5" : "h-1 cursor-row-resize hover:h-1.5",
          isDragging && "bg-primary"
        )}
        onMouseDown={handleMouseDown}
      />

      {/* Second pane */}
      <div
        className="flex-1 overflow-hidden"
        style={{
          transition: isDragging ? "none" : "all 150ms ease-out",
        }}
      >
        <PaneContainer
          paneIndex={1}
          isActive={activePaneIndex === 1}
          renderContent={renderContent}
          emptyState={emptyState}
          onFocus={() => setActivePane(1)}
          showCloseButton
          onClose={() => closePane(1)}
        />
      </div>
    </div>
  );
}

// ============================================================================
// Exports
// ============================================================================

export { PaneContainer };
