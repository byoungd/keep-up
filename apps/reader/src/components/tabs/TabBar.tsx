"use client";

import { type Tab, usePaneTabs, useTabContext } from "@/context/TabContext";
import { cn } from "@keepup/shared/utils";
import { ArrowLeftRight, Plus, SplitSquareHorizontal, X } from "lucide-react";
import * as React from "react";
import { TabContextMenu, useTabContextMenu } from "./TabContextMenu";

// ============================================================================
// TabItem Component
// ============================================================================

interface TabItemProps {
  tab: Tab;
  isActive: boolean;
  paneIndex: number;
  tabIndex: number;
  onActivate: () => void;
  onClose: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
  onDragStart: (e: React.DragEvent, tabId: string, paneIndex: number) => void;
  onDragOver: (e: React.DragEvent, tabIndex: number) => void;
  onDrop: (e: React.DragEvent) => void;
}

function TabItem({
  tab,
  isActive,
  paneIndex,
  tabIndex,
  onActivate,
  onClose,
  onContextMenu,
  onDragStart,
  onDragOver,
  onDrop,
}: TabItemProps) {
  const [isDragOver, setIsDragOver] = React.useState(false);

  const handleDragStart = (e: React.DragEvent) => {
    e.dataTransfer.effectAllowed = "move";
    onDragStart(e, tab.id, paneIndex);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setIsDragOver(true);
    onDragOver(e, tabIndex);
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    onDrop(e);
  };

  const handleClose = (e: React.MouseEvent) => {
    e.stopPropagation();
    onClose();
  };

  const handleMiddleClick = (e: React.MouseEvent) => {
    if (e.button === 1) {
      e.preventDefault();
      onClose();
    }
  };

  return (
    <div
      role="tab"
      aria-selected={isActive}
      tabIndex={isActive ? 0 : -1}
      draggable
      onClick={onActivate}
      onMouseDown={handleMiddleClick}
      onContextMenu={onContextMenu}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onActivate();
        }
      }}
      className={cn(
        "group relative flex items-center gap-2 px-3 py-1.5 min-w-[100px] max-w-[200px]",
        "rounded-t-lg border-x border-t border-transparent",
        "cursor-pointer select-none transition-colors duration-100",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50",
        isActive
          ? "bg-background border-border text-foreground shadow-sm z-10"
          : "text-muted-foreground hover:bg-surface-2 hover:text-foreground",
        isDragOver && "ring-2 ring-primary/50"
      )}
    >
      {/* Dirty indicator */}
      {tab.isDirty && (
        <span className="absolute left-1 top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-amber-500" />
      )}

      {/* Title */}
      <span className="flex-1 truncate text-sm font-medium pl-1">{tab.title}</span>

      {/* Close button */}
      <button
        type="button"
        aria-label={`Close ${tab.title}`}
        onClick={handleClose}
        className={cn(
          "p-0.5 rounded-sm transition-colors",
          "opacity-0 group-hover:opacity-100 focus:opacity-100",
          "hover:bg-surface-3 focus:outline-none focus-visible:ring-1 focus-visible:ring-primary",
          isActive && "opacity-60"
        )}
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

// ============================================================================
// TabBar Component
// ============================================================================

interface TabBarProps {
  paneIndex: number;
  className?: string;
}

export function TabBar({ paneIndex, className }: TabBarProps) {
  const { tabs, activeTabId, activateTab, closeTab, reorderTab } = usePaneTabs(paneIndex);
  const { openTab, splitWithTab, swapPanes, isSplitView } = useTabContext();
  const { menuState, openMenu, closeMenu } = useTabContextMenu();

  // Drag state
  const [dragState, setDragState] = React.useState<{
    tabId: string;
    fromPane: number;
    insertIndex: number;
  } | null>(null);

  const handleDragStart = (_e: React.DragEvent, tabId: string, fromPane: number) => {
    setDragState({ tabId, fromPane, insertIndex: -1 });
  };

  const handleDragOver = (_e: React.DragEvent, tabIndex: number) => {
    if (dragState) {
      setDragState({ ...dragState, insertIndex: tabIndex });
    }
  };

  const handleDrop = () => {
    if (dragState && dragState.insertIndex >= 0) {
      const { tabId, fromPane, insertIndex } = dragState;
      if (fromPane === paneIndex) {
        // Reorder within same pane
        const fromIndex = tabs.findIndex((t) => t.id === tabId);
        if (fromIndex !== -1 && fromIndex !== insertIndex) {
          reorderTab(fromIndex, insertIndex);
        }
      }
      // Cross-pane move is handled at SplitViewContainer level
    }
    setDragState(null);
  };

  const handleDragEnd = () => {
    setDragState(null);
  };

  const handleNewTab = () => {
    // Open a blank/new document tab
    openTab(`new-${Date.now()}`, "New Tab", paneIndex);
  };

  const handleSplitWithActive = () => {
    if (activeTabId && !isSplitView) {
      splitWithTab(activeTabId, "horizontal");
    }
  };

  // Empty state
  if (tabs.length === 0) {
    return (
      <div
        className={cn("flex items-center h-9 px-2 bg-surface-1 border-b border-border", className)}
      >
        <button
          type="button"
          aria-label="New tab"
          onClick={handleNewTab}
          className="p-1.5 rounded hover:bg-surface-2 text-muted-foreground hover:text-foreground transition-colors"
        >
          <Plus className="w-4 h-4" />
        </button>
        <span className="text-xs text-muted-foreground ml-2">No tabs open</span>
      </div>
    );
  }

  return (
    <div
      role="tablist"
      aria-label={`Tabs for pane ${paneIndex + 1}`}
      onDragEnd={handleDragEnd}
      className={cn(
        "flex items-end h-9 bg-surface-1 border-b border-border overflow-hidden",
        className
      )}
    >
      {/* Tabs */}
      <div className="flex-1 flex items-end overflow-x-auto scrollbar-none">
        {tabs.map((tab, index) => (
          <TabItem
            key={tab.id}
            tab={tab}
            isActive={tab.id === activeTabId}
            paneIndex={paneIndex}
            tabIndex={index}
            onActivate={() => activateTab(tab.id)}
            onClose={() => closeTab(tab.id)}
            onContextMenu={(e) => openMenu(tab, paneIndex, e)}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
          />
        ))}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1 px-2 pb-1">
        {/* New tab button */}
        <button
          type="button"
          aria-label="New tab"
          onClick={handleNewTab}
          className="p-1 rounded hover:bg-surface-2 text-muted-foreground hover:text-foreground transition-colors"
        >
          <Plus className="w-4 h-4" />
        </button>

        {/* Split view button (only show on first pane when not split) */}
        {paneIndex === 0 && !isSplitView && tabs.length > 1 && (
          <button
            type="button"
            aria-label="Split view"
            onClick={handleSplitWithActive}
            className="p-1 rounded hover:bg-surface-2 text-muted-foreground hover:text-foreground transition-colors"
          >
            <SplitSquareHorizontal className="w-4 h-4" />
          </button>
        )}

        {/* Swap panes button (only in split view) */}
        {isSplitView && paneIndex === 0 && (
          <button
            type="button"
            aria-label="Swap panes"
            onClick={swapPanes}
            className="p-1 rounded hover:bg-surface-2 text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeftRight className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Context Menu */}
      {menuState && (
        <TabContextMenu
          tab={menuState.tab}
          paneIndex={menuState.paneIndex}
          position={menuState.position}
          onClose={closeMenu}
        />
      )}
    </div>
  );
}

// ============================================================================
// Exports
// ============================================================================

export { TabItem };
