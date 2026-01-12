"use client";

import { AUTO_SCROLL_THRESHOLD_PX } from "@/lib/ai/constants";
import * as React from "react";

interface UseAutoScrollOptions {
  /** Dependencies that trigger scroll check */
  dependencies: React.DependencyList;
  /** Threshold in pixels from bottom to consider "at bottom" */
  threshold?: number;
}

interface UseAutoScrollReturn {
  /** Whether auto-scroll is currently enabled */
  autoScroll: boolean;
  /** Manually set auto-scroll state */
  setAutoScroll: (value: boolean) => void;
  /** Ref to attach to the scrollable container */
  containerRef: React.RefObject<HTMLDivElement | null>;
}

/**
 * Hook for optimized auto-scroll behavior
 *
 * Uses requestAnimationFrame to batch scroll operations and prevent jank.
 * Automatically disables auto-scroll when user scrolls up.
 */
export function useAutoScroll({
  dependencies,
  threshold = AUTO_SCROLL_THRESHOLD_PX,
}: UseAutoScrollOptions): UseAutoScrollReturn {
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const [autoScroll, setAutoScroll] = React.useState(true);
  const rafRef = React.useRef<number | null>(null);
  const autoScrollRef = React.useRef(autoScroll);

  // Keep ref in sync with state
  React.useEffect(() => {
    autoScrollRef.current = autoScroll;
  }, [autoScroll]);

  // Scroll to bottom with RAF batching
  React.useEffect(() => {
    if (!containerRef.current || !autoScrollRef.current) {
      return;
    }

    // Cancel any pending RAF
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
    }

    rafRef.current = requestAnimationFrame(() => {
      if (containerRef.current) {
        containerRef.current.scrollTop = containerRef.current.scrollHeight;
      }
      rafRef.current = null;
    });

    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, dependencies);

  // Listen for scroll events to detect user scrolling up
  React.useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    const handleScroll = () => {
      const { scrollHeight, scrollTop, clientHeight } = container;
      const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
      const isAtBottom = distanceFromBottom < threshold;
      setAutoScroll(isAtBottom);
    };

    container.addEventListener("scroll", handleScroll, { passive: true });
    return () => container.removeEventListener("scroll", handleScroll);
  }, [threshold]);

  return {
    autoScroll,
    setAutoScroll,
    containerRef,
  };
}
