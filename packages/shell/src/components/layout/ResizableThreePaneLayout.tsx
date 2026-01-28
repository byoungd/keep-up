"use client";

import { cn } from "@ku0/shared/utils";

import * as React from "react";
import { useThreePaneResize } from "../../hooks/useThreePaneResize";

interface ResizableThreePaneLayoutProps {
  leftPanel?: React.ReactNode;
  centerPanel: React.ReactNode;
  rightPanel?: React.ReactNode;
  defaultLayout?: [number, number, number]; // [left, center, right] percentage
  minSizes?: [number, number, number]; // minimum percentages
  minWidthsPx?: [number, number, number]; // minimum pixels
  nav?: React.ReactNode;
  onLayoutChange?: (layout: [number, number, number]) => void;
  layoutUnit?: "percent" | "pixel";
  centerPanelClassName?: string;
  layoutStyle?: "default" | "arc";
}

export interface ResizableThreePaneLayoutHandle {
  toggleLeft: () => void;
  toggleRight: () => void;
  expandLeft: (targetSize?: number) => void;
  collapseLeft: () => void;
  expandRight: (targetSize?: number) => void;
  collapseRight: () => void;
}

interface ResizeHandleProps {
  side: "left" | "right";
  dragHandle: string | null;
  onMouseDown: (e: React.MouseEvent) => void;
}

const ResizeHandle = React.memo(({ side, dragHandle, onMouseDown }: ResizeHandleProps) => (
  // biome-ignore lint/a11y/noStaticElementInteractions: Resize handle requires mouse
  <div
    className={cn(
      "w-1 -mx-0.5 z-50 cursor-col-resize touch-none relative shrink-0 transition-colors duration-200",
      dragHandle === side ? "bg-primary/50" : "hover:bg-border/40",
      dragHandle === side && "z-60"
    )}
    onMouseDown={onMouseDown}
  />
));

export const ResizableThreePaneLayout = React.forwardRef<
  ResizableThreePaneLayoutHandle,
  ResizableThreePaneLayoutProps
>(
  (
    {
      leftPanel,
      centerPanel,
      rightPanel,
      defaultLayout = [22, 58, 20],
      minSizes = [12, 30, 15],
      minWidthsPx,
      nav,
      onLayoutChange,
      layoutUnit = "percent",
      centerPanelClassName,
      layoutStyle = "default",
    },
    ref
  ) => {
    const {
      leftWidth,
      rightWidth,
      isLeftCollapsed,
      isRightCollapsed,
      isDragging,
      dragHandle,
      containerRef,
      handleMouseDown,
      toggleLeft,
      toggleRight,
      expandLeft,
      collapseLeft,
      expandRight,
      collapseRight,
    } = useThreePaneResize({ defaultLayout, minSizes, minWidthsPx, onLayoutChange, layoutUnit });

    // Expose toggle methods to parent
    React.useImperativeHandle(
      ref,
      () => ({
        toggleLeft,
        toggleRight,
        expandLeft,
        collapseLeft,
        expandRight,
        collapseRight,
      }),
      [toggleLeft, toggleRight, expandLeft, collapseLeft, expandRight, collapseRight]
    );

    const unitSuffix = layoutUnit === "percent" ? "%" : "px";

    return (
      <div
        className={cn(
          "flex flex-col h-full w-full overflow-hidden",
          layoutStyle === "arc" ? "bg-theme-base" : "bg-canvas"
        )}
        suppressHydrationWarning
      >
        {nav && <div className="flex-none z-20">{nav}</div>}

        <div
          ref={containerRef}
          className="flex-1 flex overflow-hidden relative"
          suppressHydrationWarning
        >
          {/* LEFT PANEL */}
          <div
            className={cn(
              "h-full shrink-0 overflow-hidden",
              "bg-sidebar",
              layoutStyle !== "arc" && leftWidth > 0 && "border-r border-border/40",
              !isDragging && "transition-[width] duration-200 ease-out"
            )}
            style={{ width: `${leftWidth}${unitSuffix}` }}
            suppressHydrationWarning
          >
            <div
              className={cn(
                "h-full w-full overflow-hidden flex flex-col transition-opacity duration-200",
                isLeftCollapsed ? "opacity-0 invisible" : "opacity-100 visible"
              )}
            >
              {leftPanel}
            </div>
          </div>

          {/* Left Resize Handle - only show if leftPanel exists */}
          {leftPanel && (
            <ResizeHandle
              side="left"
              dragHandle={dragHandle}
              onMouseDown={handleMouseDown("left")}
            />
          )}

          {/* CENTER PANEL */}
          <div
            className={cn(
              "h-full flex-1 min-w-0 z-10 relative overflow-hidden",
              layoutStyle === "arc"
                ? "bg-canvas rounded-lg shadow-soft my-1.5 mr-1.5 ml-0"
                : "bg-canvas"
            )}
          >
            <div
              className={cn("h-full w-full overflow-auto scroll-smooth", centerPanelClassName)}
              // biome-ignore lint/a11y/noNoninteractiveTabindex: Scrollable region needs keyboard access.
              tabIndex={0}
            >
              {centerPanel}
            </div>
          </div>

          {rightPanel && (
            <>
              <ResizeHandle
                side="right"
                dragHandle={dragHandle}
                onMouseDown={handleMouseDown("right")}
              />

              {/* RIGHT PANEL */}
              <div
                className={cn(
                  "h-full shrink-0 overflow-hidden",
                  "bg-sidebar",
                  layoutStyle !== "arc" && "border-l border-border/40",
                  !isDragging && "transition-[width] duration-200 ease-out"
                )}
                style={{ width: `${rightWidth}${unitSuffix}` }}
                suppressHydrationWarning
              >
                <div
                  className={cn(
                    "h-full w-full overflow-hidden flex flex-col transition-opacity duration-200",
                    isRightCollapsed ? "opacity-0 invisible" : "opacity-100 visible"
                  )}
                >
                  {rightPanel}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    );
  }
);

ResizableThreePaneLayout.displayName = "ResizableThreePaneLayout";
