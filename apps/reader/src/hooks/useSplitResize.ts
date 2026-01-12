import { calculateEffectiveMinSizes, calculatePanelResize } from "@/lib/layout/resizeUtils";
import * as React from "react";

interface DragState {
  isDragging: boolean;
  startX: number;
  startPrimarySize: number;
}

interface UseSplitResizeOptions {
  orientation?: "horizontal" | "vertical";
  initialRatio?: number; // 0.5 default
  minSizePercent?: number; // e.g. 20 (20%)
  minSizePx?: number; // e.g. 200 (200px)
  onResize?: (ratio: number) => void;
}

interface UseSplitResizeReturn {
  primarySize: number; // Percentage (0-100)
  isDragging: boolean;
  containerRef: React.RefObject<HTMLDivElement | null>;
  handleMouseDown: (e: React.MouseEvent) => void;
  setPrimarySize: (size: number) => void;
}

export function useSplitResize({
  orientation = "horizontal",
  initialRatio = 0.5,
  minSizePercent = 20,
  minSizePx = 0,
  onResize,
}: UseSplitResizeOptions): UseSplitResizeReturn {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const [primarySize, setPrimarySize] = React.useState(initialRatio * 100);

  const [dragState, setDragState] = React.useState<DragState>({
    isDragging: false,
    startX: 0,
    startPrimarySize: 0,
  });

  const handleMouseDown = React.useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      setDragState({
        isDragging: true,
        startX: orientation === "horizontal" ? e.clientX : e.clientY,
        startPrimarySize: primarySize,
      });
    },
    [orientation, primarySize]
  );

  React.useEffect(() => {
    if (!dragState.isDragging) {
      return;
    }

    const handleMouseMove = (e: MouseEvent) => {
      const container = containerRef.current;
      if (!container) {
        return;
      }

      const containerSize =
        orientation === "horizontal" ? container.offsetWidth : container.offsetHeight;

      if (containerSize === 0) {
        return;
      }

      const currentPos = orientation === "horizontal" ? e.clientX : e.clientY;
      const deltaPx = currentPos - dragState.startX;
      const deltaPercent = (deltaPx / containerSize) * 100;

      // Calculate effective min size
      // We treat the "secondary" pane as having the same min size requirement
      // So maxAvailable for primary is 100 - minSize
      const effectiveMinSizes = calculateEffectiveMinSizes(
        [minSizePercent],
        [minSizePx],
        containerSize
      );
      const effectiveMin = effectiveMinSizes[0];
      const maxAvailable = 100 - effectiveMin;

      const newSize = calculatePanelResize(
        dragState.startPrimarySize,
        deltaPercent,
        effectiveMin,
        maxAvailable
      );

      setPrimarySize(newSize);
      onResize?.(newSize / 100);
    };

    const handleMouseUp = () => {
      setDragState((prev) => ({ ...prev, isDragging: false }));
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [dragState, orientation, minSizePercent, minSizePx, onResize]);

  // Cursor style
  React.useEffect(() => {
    if (dragState.isDragging) {
      document.body.style.cursor = orientation === "horizontal" ? "col-resize" : "row-resize";
      document.body.style.userSelect = "none";
    } else {
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    }
  }, [dragState.isDragging, orientation]);

  return {
    primarySize,
    isDragging: dragState.isDragging,
    containerRef,
    handleMouseDown,
    setPrimarySize,
  };
}
