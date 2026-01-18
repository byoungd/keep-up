"use client";

import { motion } from "framer-motion";
import * as React from "react";
import { cn } from "../utils/cn";
import type { ResizableSidebarProps } from "./types";

const MIN_WIDTH_DEFAULT = 200;
const DEFAULT_WIDTH = 240;
const MAX_WIDTH_DEFAULT = 400;
const COLLAPSE_THRESHOLD = 120;
const COLLAPSED_WIDTH_RAIL = 72;
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
  const pendingWidth = React.useRef<number | null>(null);
  const rafId = React.useRef<number | null>(null);

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

  const flushWidth = React.useCallback(() => {
    rafId.current = null;
    if (pendingWidth.current === null) {
      return;
    }
    setWidth(pendingWidth.current);
  }, []);

  const queueWidth = React.useCallback(
    (nextWidth: number) => {
      pendingWidth.current = nextWidth;
      if (typeof requestAnimationFrame !== "function") {
        flushWidth();
        return;
      }
      if (rafId.current === null) {
        rafId.current = requestAnimationFrame(flushWidth);
      }
    },
    [flushWidth]
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
      const nextWidth = Math.max(minWidth, Math.min(maxWidth, rawWidth));
      if (isCollapsed) {
        setIsCollapsed(false);
      }
      queueWidth(nextWidth);
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      if (rafId.current !== null && typeof cancelAnimationFrame === "function") {
        cancelAnimationFrame(rafId.current);
        rafId.current = null;
      }
      pendingWidth.current = null;
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDragging, isCollapsed, queueWidth, setIsCollapsed, minWidth, maxWidth]);

  const targetWidth = isCollapsed ? collapsedWidth : width;
  const transition = isDragging ? { duration: 0 } : { type: "spring", stiffness: 400, damping: 30 };

  const sidebar = (
    <motion.div
      initial={false}
      animate={{ width: targetWidth }}
      transition={transition}
      className={cn(
        "relative shrink-0 z-overlay",
        isDragging && "select-none",
        isFloating && "fixed left-0 top-0 bottom-0 shadow-2xl z-50",
        className
      )}
      style={{ width: targetWidth }}
      onMouseLeave={() => {
        if (autoExpanded && !isDragging) {
          setIsCollapsed(true);
          setAutoExpanded(false);
        }
      }}
    >
      {collapseMode === "peek" && isCollapsed && (
        // biome-ignore lint/a11y/noStaticElementInteractions: Hover trigger
        <div
          className="absolute inset-y-0 left-0 w-2 cursor-pointer"
          onMouseEnter={() => {
            setIsCollapsed(false);
            setAutoExpanded(true);
          }}
        />
      )}
      {collapseMode === "rail" && isCollapsed && collapsedContent}
      {!isCollapsed && children}

      {collapseMode === "rail" && isCollapsed && (
        // biome-ignore lint/a11y/noStaticElementInteractions: Resize handle requires mouse
        <div
          className={cn(
            "absolute -right-0.5 top-0 bottom-0 w-1 cursor-col-resize z-drag",
            "transition-colors hover:bg-border/40"
          )}
          onMouseDown={handleCollapsedDragStart}
        />
      )}

      {!isCollapsed && (
        // biome-ignore lint/a11y/noStaticElementInteractions: Resize handle requires mouse
        <div
          className={cn(
            "absolute -right-0.5 top-0 bottom-0 w-1 cursor-col-resize z-drag",
            "transition-colors",
            isDragging ? "bg-primary/50" : "hover:bg-border/40"
          )}
          onMouseDown={handleDragStart}
        />
      )}
    </motion.div>
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
