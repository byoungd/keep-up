"use client";

import { cn } from "@/lib/utils";
import { AnimatePresence, motion } from "framer-motion";
import type * as React from "react";

export interface RightRailProps {
  /** Whether the rail is expanded/visible */
  open: boolean;
  /** Called when rail visibility changes */
  onOpenChange?: (open: boolean) => void;
  /** Rail content */
  children: React.ReactNode;
  /** Width when expanded */
  width?: number;
  /** Minimum width when collapsed (0 for fully hidden) */
  collapsedWidth?: number;
  /** Custom class name */
  className?: string;
}

/**
 * Right Rail component for side content panels.
 * Supports collapse/expand animation.
 */
export function RightRail({
  open,
  // onOpenChange is available for future use but not used internally
  children,
  width = 320,
  collapsedWidth = 0,
  className,
}: RightRailProps) {
  return (
    <AnimatePresence initial={false}>
      <motion.aside
        initial={false}
        animate={{
          width: open ? width : collapsedWidth,
          opacity: open ? 1 : collapsedWidth > 0 ? 1 : 0,
        }}
        transition={{ duration: 0.2, ease: [0.32, 0.72, 0, 1] }}
        className={cn(
          "shrink-0 border-l border-border/40 bg-surface-1 overflow-hidden",
          "flex flex-col h-full",
          className
        )}
        aria-hidden={!open}
      >
        {children}
      </motion.aside>
    </AnimatePresence>
  );
}

export interface RightRailHeaderProps {
  title: string;
  children?: React.ReactNode;
  className?: string;
}

/**
 * Header for Right Rail with title and optional actions.
 */
export function RightRailHeader({ title, children, className }: RightRailHeaderProps) {
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-2 px-4 py-3 border-b border-border/40 shrink-0",
        className
      )}
    >
      <h3 className="text-sm font-semibold text-foreground truncate">{title}</h3>
      {children && <div className="flex items-center gap-1">{children}</div>}
    </div>
  );
}

export interface RightRailContentProps {
  children: React.ReactNode;
  className?: string;
}

/**
 * Scrollable content area for Right Rail.
 */
export function RightRailContent({ children, className }: RightRailContentProps) {
  return <div className={cn("flex-1 overflow-y-auto", className)}>{children}</div>;
}
