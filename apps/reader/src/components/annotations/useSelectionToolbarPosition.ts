import type { SelectionResult } from "@/lib/dom/selection";
import { useEffect, useState } from "react";

export type ToolbarPosition = { x: number; y: number } | null;

/**
 * Calculate toolbar position from selection.
 * Stores the Range and queries getBoundingClientRect() on scroll/resize
 * to ensure 100% accurate viewport positioning without manual math.
 *
 * This avoids issues with:
 * 1. Finding the correct scroll container (window vs main vs div)
 * 2. Nested scroll containers
 * 3. Zoom/Resize
 */
export function useSelectionToolbarPosition(selection: SelectionResult | null): ToolbarPosition {
  const [position, setPosition] = useState<ToolbarPosition>(null);
  const [range, setRange] = useState<Range | null>(null);

  // Capture the range when selection changes
  useEffect(() => {
    if (!selection) {
      setRange(null);
      setPosition(null);
      return;
    }

    try {
      const domSelection = window.getSelection();
      if (domSelection && domSelection.rangeCount > 0) {
        // Clone the range found in the selection
        const r = domSelection.getRangeAt(0).cloneRange();
        setRange(r);
      } else {
        setRange(null);
      }
    } catch (_e) {
      setRange(null);
    }
  }, [selection]);

  // Update position based on current range rect
  useEffect(() => {
    if (!range) {
      setPosition(null);
      return;
    }

    const updatePosition = () => {
      // range.getBoundingClientRect() ALWAYS returns the current viewport coordinates
      // of the text, accounting for all scrolling, zooming, and layout changes.
      const rect = range.getBoundingClientRect();

      // If collapsed or off-screen, might return 0s (though 0x0 is possible for cursor)
      // Usually checking width/height > 0 is good, but for cursor it might be 0 width.
      // For selection, width usually > 0.
      if (rect.width === 0 && rect.height === 0 && rect.top === 0 && rect.left === 0) {
        return;
      }

      const centerX = rect.left + rect.width / 2;
      const viewportWidth = window.innerWidth;
      const minX = 12;
      const maxX = Math.max(minX, viewportWidth - 12);
      const minY = 72;

      setPosition({
        x: Math.min(Math.max(centerX, minX), maxX),
        y: Math.max(rect.top, minY),
      });
    };

    // Initial update
    updatePosition();

    // Update on any scroll or resize - capture phase to catch all scrolling anywhere
    // Use requestAnimationFrame for performance throttled update usually,
    // but native scroll events + updateState inside react batching is usually fine.
    // For smoothness, we can use RAF if jittery.
    const handleUpdate = () => {
      requestAnimationFrame(updatePosition);
    };

    // Capture phase is crucial to detect scroll on any element (like the main container)
    window.addEventListener("scroll", handleUpdate, { capture: true, passive: true });
    window.addEventListener("resize", handleUpdate, { passive: true });

    return () => {
      window.removeEventListener("scroll", handleUpdate, { capture: true });
      window.removeEventListener("resize", handleUpdate);
    };
  }, [range]);

  return position;
}
