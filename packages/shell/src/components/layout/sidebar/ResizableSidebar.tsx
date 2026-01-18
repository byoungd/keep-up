"use client";

import { cn } from "@ku0/shared/utils";
import { motion } from "framer-motion";
import * as React from "react";
import { useReaderShell } from "../../../context/ReaderShellContext";

const MIN_WIDTH = 200; // Minimum visible width when expanded
const DEFAULT_WIDTH = 240; // Default comfortable width
const MAX_WIDTH = 400;
const COLLAPSE_THRESHOLD = 120; // Below this during drag = collapse
const COLLAPSED_WIDTH = 72;
const EDGE_HOVER_WIDTH = 8;

const SIDEBAR_WIDTH_KEY = "sidebar-width-v1";

interface ResizableSidebarProps {
  children: React.ReactNode;
  collapsedContent?: React.ReactNode;
  className?: string;
  collapseMode?: "peek" | "rail";
}

export function ResizableSidebar({
  children,
  collapsedContent,
  className,
  collapseMode = "peek",
}: ResizableSidebarProps) {
  const [width, setWidth] = React.useState(DEFAULT_WIDTH);
  const { sidebar: sidebarState } = useReaderShell();
  const { isCollapsed, setCollapsed: setIsCollapsed } = sidebarState;
  const [autoExpanded, setAutoExpanded] = React.useState(false);
  const [isDragging, setIsDragging] = React.useState(false);
  const lastExpandedWidth = React.useRef(DEFAULT_WIDTH);
  const dragStartX = React.useRef(0);
  const dragStartWidth = React.useRef(0);
  const pendingWidth = React.useRef<number | null>(null);
  const rafId = React.useRef<number | null>(null);
  const collapsedWidth = collapseMode === "rail" ? COLLAPSED_WIDTH : EDGE_HOVER_WIDTH;
  const isFloating = autoExpanded && collapseMode === "peek";

  // Load persisted width
  React.useEffect(() => {
    try {
      const savedWidth = localStorage.getItem(SIDEBAR_WIDTH_KEY);
      if (savedWidth) {
        const parsed = Number.parseInt(savedWidth, 10);
        if (!Number.isNaN(parsed)) {
          setWidth(parsed);
        }
      }
    } catch {
      // Ignore storage errors
    }
  }, []);

  // Save width on change
  React.useEffect(() => {
    if (!isDragging) {
      try {
        localStorage.setItem(SIDEBAR_WIDTH_KEY, String(width));
      } catch {
        // Ignore storage errors
      }
    }
  }, [width, isDragging]);

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
      const initialWidth = Math.max(MIN_WIDTH, lastExpandedWidth.current);
      setIsCollapsed(false);
      setWidth(initialWidth);
      startDrag(e, initialWidth);
    },
    [setIsCollapsed, startDrag]
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

      // Clamp between MIN_WIDTH and MAX_WIDTH
      const nextWidth = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, rawWidth));
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
  }, [isDragging, isCollapsed, queueWidth, setIsCollapsed]);

  const targetWidth = isCollapsed ? collapsedWidth : width;
  const transition = isDragging ? { duration: 0 } : { type: "spring", stiffness: 400, damping: 30 };

  const sidebar = (
    <motion.div
      initial={false}
      animate={{ width: targetWidth }}
      transition={transition}
      className={cn(
        "relative shrink-0 z-[51] bg-surface-2",
        isDragging && "select-none",
        isFloating && "fixed left-0 top-0 bottom-0 shadow-2xl z-[51]",
        className
      )}
      style={{ width: targetWidth }}
      onMouseLeave={(e) => {
        if (autoExpanded && !isDragging) {
          // Check if any interactive element is currently open (has data-state="open")
          // This prevents the sidebar from collapsing when a dropdown or dialog is active
          if (e.currentTarget.querySelector('[data-state="open"]')) {
            return;
          }
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
