"use client";

import { cn } from "@keepup/shared/utils";
import { useCallback, useRef, useState } from "react";

export type RangeHandleSide = "start" | "end";

export type RangeHandleProps = {
  /** Which end of the range this handle controls */
  side: RangeHandleSide;
  /** Current position (for rendering) */
  position: { x: number; y: number };
  /** Callback when drag updates (rAF-throttled) */
  onDrag: (side: RangeHandleSide, clientX: number, clientY: number) => void;
  /** Callback when drag ends */
  onDragEnd: (side: RangeHandleSide) => void;
  /** Whether the handle is actively being dragged */
  isDragging?: boolean;
  /** Color for the handle */
  color?: "yellow" | "green" | "red" | "purple";
};

const handleColors = {
  yellow: "bg-accent-amber border-accent-amber",
  green: "bg-accent-emerald border-accent-emerald",
  red: "bg-accent-rose border-accent-rose",
  purple: "bg-accent-violet border-accent-violet",
};

/**
 * Draggable handle for adjusting annotation range boundaries.
 * Uses rAF-throttled pointer updates for smooth 60fps performance.
 * All state is UI-only - LFCC updates happen on drag end.
 */
export function RangeHandle({
  side,
  position,
  onDrag,
  onDragEnd,
  isDragging = false,
  color = "yellow",
}: RangeHandleProps) {
  const rafRef = useRef<number | null>(null);
  const [localDragging, setLocalDragging] = useState(false);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setLocalDragging(true);
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, []);

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!localDragging) {
        return;
      }

      // Cancel any pending rAF
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
      }

      // Schedule update on next frame (rAF-throttling)
      rafRef.current = requestAnimationFrame(() => {
        onDrag(side, e.clientX, e.clientY);
        rafRef.current = null;
      });
    },
    [localDragging, onDrag, side]
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent) => {
      if (!localDragging) {
        return;
      }

      // Cancel pending rAF
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }

      setLocalDragging(false);
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
      onDragEnd(side);
    },
    [localDragging, onDragEnd, side]
  );

  const dragging = isDragging || localDragging;

  return (
    <div
      className={cn(
        "absolute z-50 touch-none select-none",
        "w-3 h-3 -translate-x-1/2 -translate-y-1/2",
        "rounded-full border-2 shadow-sm",
        handleColors[color],
        dragging ? "scale-125 shadow-md" : "hover:scale-110",
        "transition-transform duration-100 ease-out",
        "cursor-grab active:cursor-grabbing"
      )}
      style={{
        left: position.x,
        top: position.y,
      }}
      role="slider"
      aria-label={`${side} range handle`}
      aria-valuenow={side === "start" ? 0 : 100}
      aria-valuemin={0}
      aria-valuemax={100}
      tabIndex={0}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
    />
  );
}

/**
 * Hook for managing range handle drag state.
 */
export function useRangeHandleDrag() {
  const [activeSide, setActiveSide] = useState<RangeHandleSide | null>(null);
  const [pending, setPending] = useState<{
    side: RangeHandleSide;
    x: number;
    y: number;
  } | null>(null);

  const handleDrag = useCallback((side: RangeHandleSide, clientX: number, clientY: number) => {
    setActiveSide(side);
    setPending({ side, x: clientX, y: clientY });
  }, []);

  const handleDragEnd = useCallback(() => {
    setActiveSide(null);
    setPending(null);
  }, []);

  return {
    activeSide,
    pending,
    handleDrag,
    handleDragEnd,
  };
}
