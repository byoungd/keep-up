"use client";

import { useSplitResize } from "@/hooks/useSplitResize";
import { cn } from "@ku0/shared/utils";
import type { CSSProperties, ReactNode } from "react";

interface SplitPaneLayoutProps {
  primary: ReactNode;
  secondary: ReactNode;
  orientation?: "horizontal" | "vertical";
  initialRatio?: number;
  minSizePercent?: number;
  minSizePx?: number;
  className?: string; // Additional classes for the container
  onResize?: (ratio: number) => void;
}

export function SplitPaneLayout({
  primary,
  secondary,
  orientation = "horizontal",
  initialRatio = 0.5,
  minSizePercent = 20,
  minSizePx = 0,
  className,
  onResize,
}: SplitPaneLayoutProps) {
  const { primarySize, isDragging, containerRef, handleMouseDown } = useSplitResize({
    orientation,
    initialRatio,
    minSizePercent,
    minSizePx,
    onResize,
  });

  return (
    <div
      ref={containerRef}
      className={cn(
        "flex h-full w-full overflow-hidden relative",
        orientation === "vertical" ? "flex-col" : "flex-row",
        className
      )}
    >
      {/* Primary Pane */}
      <div
        style={{
          [orientation === "horizontal" ? "width" : "height"]: `${primarySize}%`,
          opacity: primarySize < 1 ? 0 : 1,
          visibility: primarySize < 1 ? "hidden" : "visible",
        }}
        className={cn(
          "relative overflow-hidden shrink-0",
          !isDragging && "transition-[width,height] duration-200 ease-out"
        )}
      >
        {primary}
      </div>

      {/* Resize Handle */}
      {/* We overlay the handle to avoid taking up layout space, but ensure it's clickable */}
      <div
        onMouseDown={handleMouseDown}
        className={cn(
          "z-50 flex items-center justify-center shrink-0 hover:bg-primary/10 transition-colors",
          orientation === "horizontal"
            ? "w-4 -ml-2 h-full cursor-col-resize absolute left-[var(--split-pos)]"
            : "h-4 -mt-2 w-full cursor-row-resize absolute top-[var(--split-pos)]"
        )}
        style={
          {
            "--split-pos": `${primarySize}%`,
          } as CSSProperties
        }
      >
        {/* Visual Line */}
        <div
          className={cn(
            "bg-border/50",
            orientation === "horizontal" ? "w-[1px] h-full" : "h-[1px] w-full",
            isDragging && "bg-primary"
          )}
        />
      </div>

      {/* Secondary Pane */}
      <div className="flex-1 overflow-hidden min-w-0 min-h-0 relative bg-background">
        {secondary}
      </div>
    </div>
  );
}
