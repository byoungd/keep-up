import { calculateEffectiveMinSizes, calculatePanelResize } from "@/lib/layout/resizeUtils";
import * as React from "react";

interface DragState {
  isDragging: boolean;
  handle: "left" | "right" | null;
  startX: number;
  startLeftWidth: number;
  startRightWidth: number;
}

interface UseThreePaneResizeOptions {
  defaultLayout: [number, number, number]; // [left, center, right] (unit depends on layoutUnit)
  minSizes: [number, number, number]; // minimum sizes (unit depends on layoutUnit)
  minWidthsPx?: [number, number, number]; // override minimums (px) - mainly for % mode
  onLayoutChange?: (layout: [number, number, number]) => void;
  layoutUnit?: "percent" | "pixel";
}

interface UseThreePaneResizeReturn {
  leftWidth: number;
  rightWidth: number;
  isLeftCollapsed: boolean;
  isRightCollapsed: boolean;
  isDragging: boolean;
  dragHandle: "left" | "right" | null;
  containerRef: React.RefObject<HTMLDivElement | null>;
  handleMouseDown: (handle: "left" | "right") => (e: React.MouseEvent) => void;
  toggleLeft: () => void;
  toggleRight: () => void;
  expandRight: (targetSize?: number) => void;
  collapseRight: () => void;
}

/** Update panel memory after drag ends */
function updatePanelMemory(
  handle: "left" | "right" | null,
  leftWidth: number,
  rightWidth: number,
  minSizes: [number, number, number],
  setPrevLeftWidth: (w: number) => void,
  setPrevRightWidth: (w: number) => void
): void {
  if (handle === "left") {
    if (leftWidth >= minSizes[0]) {
      setPrevLeftWidth(leftWidth);
    } else if (leftWidth < 1) {
      setPrevLeftWidth(minSizes[0]);
    }
  }

  if (handle === "right") {
    if (rightWidth >= minSizes[2]) {
      setPrevRightWidth(rightWidth);
    } else if (rightWidth < 1) {
      setPrevRightWidth(minSizes[2]);
    }
  }
}

export function useThreePaneResize({
  defaultLayout,
  minSizes,
  minWidthsPx,
  onLayoutChange,
  layoutUnit = "percent",
}: UseThreePaneResizeOptions): UseThreePaneResizeReturn {
  const containerRef = React.useRef<HTMLDivElement>(null);

  // Panel widths (unit matches layoutUnit)
  const [leftWidth, setLeftWidth] = React.useState(defaultLayout[0]);
  const [rightWidth, setRightWidth] = React.useState(defaultLayout[2]);

  // Track collapsed state and previous sizes for restoration
  const [isLeftCollapsed, setIsLeftCollapsed] = React.useState(leftWidth < 1);
  const [isRightCollapsed, setIsRightCollapsed] = React.useState(rightWidth < 1);
  const [prevLeftWidth, setPrevLeftWidth] = React.useState(defaultLayout[0]);
  const [prevRightWidth, setPrevRightWidth] = React.useState(defaultLayout[2]);

  // Drag state
  const [dragState, setDragState] = React.useState<DragState>({
    isDragging: false,
    handle: null,
    startX: 0,
    startLeftWidth: 0,
    startRightWidth: 0,
  });

  // Handle mouse down on resize handles
  const handleMouseDown = React.useCallback(
    (handle: "left" | "right") => (e: React.MouseEvent) => {
      e.preventDefault();
      setDragState({
        isDragging: true,
        handle,
        startX: e.clientX,
        startLeftWidth: leftWidth,
        startRightWidth: rightWidth,
      });
    },
    [leftWidth, rightWidth]
  );

  // Handle mouse move during drag
  React.useEffect(() => {
    if (!dragState.isDragging) {
      return;
    }

    // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: resize logic with multiple panel constraints
    const handleMouseMove = (e: MouseEvent) => {
      const container = containerRef.current;
      if (!container) {
        return;
      }

      const containerWidth = container.offsetWidth;
      const deltaX = e.clientX - dragState.startX;

      let delta: number;
      if (layoutUnit === "percent") {
        delta = (deltaX / containerWidth) * 100;
      } else {
        delta = deltaX;
      }

      // Calculate effective minimums in correct unit
      const effectiveMinSizes = calculateEffectiveMinSizes(
        minSizes,
        minWidthsPx,
        containerWidth,
        layoutUnit
      );

      if (dragState.handle === "left") {
        const totalSize = layoutUnit === "percent" ? 100 : containerWidth;
        const maxAvailable = totalSize - effectiveMinSizes[1] - rightWidth;
        const newLeftWidth = calculatePanelResize(
          dragState.startLeftWidth,
          delta,
          effectiveMinSizes[0],
          maxAvailable
        );

        setLeftWidth(newLeftWidth);
        setIsLeftCollapsed(newLeftWidth < 1);
      } else if (dragState.handle === "right") {
        const totalSize = layoutUnit === "percent" ? 100 : containerWidth;
        // Delta is inverted for right panel width
        const maxAvailable = totalSize - effectiveMinSizes[1] - leftWidth;
        const newRightWidth = calculatePanelResize(
          dragState.startRightWidth,
          -delta,
          effectiveMinSizes[2],
          maxAvailable
        );

        setRightWidth(newRightWidth);
        setIsRightCollapsed(newRightWidth < 1);
      }
    };

    const handleMouseUp =
      // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: cleanup logic with state persistence
      () => {
        if (dragState.isDragging) {
          updatePanelMemory(
            dragState.handle,
            leftWidth,
            rightWidth,
            minSizes,
            setPrevLeftWidth,
            setPrevRightWidth
          );

          if (onLayoutChange) {
            // Commit the final layout
            const containerWidth =
              containerRef.current?.offsetWidth || (layoutUnit === "percent" ? 100 : 0);
            const totalSize = layoutUnit === "percent" ? 100 : containerWidth;
            const centerWidth = totalSize - leftWidth - rightWidth;
            onLayoutChange([leftWidth, centerWidth, rightWidth]);
          }
        }
        setDragState((prev) => ({ ...prev, isDragging: false, handle: null }));
      };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [dragState, minSizes, minWidthsPx, leftWidth, rightWidth, onLayoutChange, layoutUnit]);

  // Update body cursor during drag
  React.useEffect(() => {
    if (dragState.isDragging) {
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    } else {
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    }
  }, [dragState.isDragging]);

  // Toggle methods
  const toggleLeft = React.useCallback(() => {
    if (isLeftCollapsed) {
      setLeftWidth(prevLeftWidth);
      setIsLeftCollapsed(false);
    } else {
      setPrevLeftWidth(leftWidth);
      setLeftWidth(0);
      setIsLeftCollapsed(true);
    }
  }, [isLeftCollapsed, leftWidth, prevLeftWidth]);

  const toggleRight = React.useCallback(() => {
    if (isRightCollapsed) {
      const targetWidth = prevRightWidth < minSizes[2] ? minSizes[2] : prevRightWidth;
      setRightWidth(targetWidth);
      setIsRightCollapsed(false);
    } else {
      setPrevRightWidth(rightWidth);
      setRightWidth(0);
      setIsRightCollapsed(true);
    }
  }, [isRightCollapsed, rightWidth, prevRightWidth, minSizes]);

  const expandRight = React.useCallback(
    (targetSize?: number) => {
      // If not currently right-collapsed and no specific target size, do nothing
      if (!isRightCollapsed && !targetSize) {
        return;
      }

      // Default target: restore previous or min size
      let targetWidth = prevRightWidth < minSizes[2] ? minSizes[2] : prevRightWidth;

      if (targetSize) {
        // If explicit target size is valid (>= min), use it
        if (targetSize >= minSizes[2]) {
          targetWidth = targetSize;
          // Update memory so subsequent toggles remember this size
          setPrevRightWidth(targetSize);
        } else if (targetSize > 0) {
          // If target is small but positive, clamp to min
          targetWidth = minSizes[2];
          setPrevRightWidth(targetSize); // Snap to target even if small? No, reuse clamp logic.
          // Actually existing logic was fine:
          targetWidth = minSizes[2];
          setPrevRightWidth(targetWidth);
        }
        // If target is 0/falsy, ignore it and use restoration logic
      }

      setRightWidth(targetWidth);
      setIsRightCollapsed(false);
    },
    [isRightCollapsed, prevRightWidth, minSizes]
  );

  const collapseRight = React.useCallback(() => {
    if (!isRightCollapsed) {
      setPrevRightWidth(rightWidth);
      setRightWidth(0);
      setIsRightCollapsed(true);
    }
  }, [isRightCollapsed, rightWidth]);

  return {
    leftWidth,
    rightWidth,
    isLeftCollapsed,
    isRightCollapsed,
    isDragging: dragState.isDragging,
    dragHandle: dragState.handle,
    containerRef,
    handleMouseDown,
    toggleLeft,
    toggleRight,
    expandRight,
    collapseRight,
  };
}
