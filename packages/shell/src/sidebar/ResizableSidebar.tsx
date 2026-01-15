"use client";

import * as React from "react";
import { cn } from "../utils/cn";
import type { ResizableSidebarProps } from "./types";

const MIN_WIDTH_DEFAULT = 200;
const DEFAULT_WIDTH = 240;
const MAX_WIDTH_DEFAULT = 400;
const COLLAPSE_THRESHOLD = 120;
const COLLAPSED_WIDTH_RAIL = 56;
const EDGE_HOVER_WIDTH = 8;

const STORAGE_KEY_DEFAULT = "sidebar-width-v1";

/**
 * ResizableSidebar - A sidebar container that supports resizing and collapse modes.
 *
 * Extracted from Reader's sidebar for shared use.
 * Supports two collapse modes:
 * - "peek": Hidden edge that expands on hover
 * - "rail": Compact icon rail
 */
export function ResizableSidebar({
  children,
  collapsedContent,
  className,
  collapseMode = "peek",
  isCollapsed: controlledCollapsed,
  onCollapsedChange,
  defaultWidth = DEFAULT_WIDTH,
  minWidth = MIN_WIDTH_DEFAULT,
  maxWidth = MAX_WIDTH_DEFAULT,
  storageKey = STORAGE_KEY_DEFAULT,
}: ResizableSidebarProps) {
  const [width, setWidth] = React.useState(defaultWidth);
  const [internalCollapsed, setInternalCollapsed] = React.useState(false);
  const [autoExpanded, setAutoExpanded] = React.useState(false);
  const [isDragging, setIsDragging] = React.useState(false);

  // Support both controlled and uncontrolled collapsed state
  const isCollapsed = controlledCollapsed ?? internalCollapsed;
  const setIsCollapsed = React.useCallback(
    (collapsed: boolean) => {
      if (onCollapsedChange) {
        onCollapsedChange(collapsed);
      } else {
        setInternalCollapsed(collapsed);
      }
    },
    [onCollapsedChange]
  );

  const lastExpandedWidth = React.useRef(defaultWidth);
  const dragStartX = React.useRef(0);
  const dragStartWidth = React.useRef(0);

  const collapsedWidth = collapseMode === "rail" ? COLLAPSED_WIDTH_RAIL : EDGE_HOVER_WIDTH;
  const isFloating = autoExpanded && collapseMode === "peek";

  // Load persisted width
  React.useEffect(() => {
    try {
      const savedWidth = localStorage.getItem(storageKey);
      if (savedWidth) {
        const parsed = Number.parseInt(savedWidth, 10);
        if (!Number.isNaN(parsed)) {
          setWidth(parsed);
        }
      }
    } catch {
      // Ignore storage errors
    }
  }, [storageKey]);

  // Save width on change
  React.useEffect(() => {
    if (!isDragging) {
      try {
        localStorage.setItem(storageKey, String(width));
      } catch {
        // Ignore storage errors
      }
    }
  }, [width, isDragging, storageKey]);

  React.useEffect(() => {
    if (!isCollapsed) {
      lastExpandedWidth.current = width;
    }
  }, [width, isCollapsed]);

  // Drag handlers
  const startDrag = React.useCallback((e: React.MouseEvent, initialWidth: number) => {
    e.preventDefault();
    setIsDragging(true);
    setAutoExpanded(false);
    dragStartX.current = e.clientX;
    dragStartWidth.current = initialWidth;
  }, []);

  const handleDragStart = React.useCallback(
    (e: React.MouseEvent) => {
      startDrag(e, width);
    },
    [startDrag, width]
  );

  const handleCollapsedDragStart = React.useCallback(
    (e: React.MouseEvent) => {
      const initialWidth = Math.max(minWidth, lastExpandedWidth.current);
      setIsCollapsed(false);
      setWidth(initialWidth);
      startDrag(e, initialWidth);
    },
    [setIsCollapsed, startDrag, minWidth]
  );

  React.useEffect(() => {
    if (!isDragging) {
      return;
    }

    const handleMouseMove = (e: MouseEvent) => {
      const delta = e.clientX - dragStartX.current;
      const rawWidth = dragStartWidth.current + delta;

      // If dragged below collapse threshold, snap to collapsed
      if (rawWidth < COLLAPSE_THRESHOLD) {
        if (!isCollapsed) {
          setIsCollapsed(true);
        }
        return;
      }

      // Clamp between minWidth and maxWidth
      const newWidth = Math.max(minWidth, Math.min(maxWidth, rawWidth));
      if (isCollapsed) {
        setIsCollapsed(false);
      }
      setWidth(newWidth);
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDragging, isCollapsed, setIsCollapsed, minWidth, maxWidth]);

  // Collapsed: render a compact rail or hidden edge
  if (isCollapsed) {
    return (
      <div
        className={cn("relative shrink-0 z-overlay border-r bg-surface-1", className)}
        style={{ width: collapsedWidth }}
        onMouseLeave={() => {
          if (autoExpanded && !isDragging) {
            setIsCollapsed(true);
            setAutoExpanded(false);
          }
        }}
      >
        {collapseMode === "peek" && (
          <div
            className="absolute inset-y-0 left-0 w-2 cursor-pointer"
            onMouseEnter={() => {
              setIsCollapsed(false);
              setAutoExpanded(true);
            }}
          />
        )}
        {collapseMode === "rail" && collapsedContent}
        {collapseMode === "rail" && (
          <div
            className={cn(
              "absolute -right-0.5 top-0 bottom-0 w-1 cursor-col-resize z-drag",
              "transition-colors hover:bg-border/40"
            )}
            onMouseDown={handleCollapsedDragStart}
          />
        )}
      </div>
    );
  }

  // Normal resizable sidebar
  const sidebar = (
    <div
      className={cn(
        "relative shrink-0 z-overlay border-r bg-surface-1",
        isDragging && "select-none",
        isFloating && "fixed left-0 top-0 bottom-0 shadow-2xl z-50",
        className
      )}
      style={{ width }}
      onMouseLeave={() => {
        if (autoExpanded && !isDragging) {
          setIsCollapsed(true);
          setAutoExpanded(false);
        }
      }}
    >
      {children}

      {/* Resize handle */}
      <div
        className={cn(
          "absolute -right-0.5 top-0 bottom-0 w-1 cursor-col-resize z-drag",
          "transition-colors",
          isDragging ? "bg-primary/50" : "hover:bg-border/40"
        )}
        onMouseDown={handleDragStart}
      />
    </div>
  );

  if (isFloating) {
    return (
      <>
        <div style={{ width: collapsedWidth }} className="shrink-0 relative" />
        {sidebar}
      </>
    );
  }

  return sidebar;
}
