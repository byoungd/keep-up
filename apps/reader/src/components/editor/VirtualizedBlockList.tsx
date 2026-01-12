"use client";

/**
 * Virtualized Block List
 *
 * P1.3: True virtualization for large documents.
 * Renders only visible blocks using @tanstack/react-virtual.
 *
 * Target: Support 100k blocks with <500 DOM nodes.
 */

import { useVirtualizer } from "@tanstack/react-virtual";
import * as React from "react";

// ============================================================================
// Types
// ============================================================================

/** Block data for virtualization */
export interface VirtualBlock {
  /** Block ID */
  id: string;
  /** Block type */
  type: string;
  /** Estimated height in pixels */
  estimatedHeight: number;
  /** Actual measured height (after render) */
  measuredHeight?: number;
  /** Block content (serialized) */
  content?: unknown;
  /** Whether block is currently visible */
  isVisible?: boolean;
}

/** Virtualization configuration */
export interface VirtualizationConfig {
  /** Overscan count (blocks to render outside viewport) */
  overscan: number;
  /** Default block height estimate in pixels */
  defaultBlockHeight: number;
  /** Minimum block height */
  minBlockHeight: number;
  /** Maximum block height (for safety) */
  maxBlockHeight: number;
  /** Enable dynamic height measurement */
  enableDynamicHeight: boolean;
  /** Scroll debounce in ms */
  scrollDebounceMs: number;
  /** Enable prefetch */
  enablePrefetch: boolean;
  /** Prefetch distance (blocks ahead of viewport) */
  prefetchDistance: number;
}

/** Virtualized block list props */
export interface VirtualizedBlockListProps {
  /** Block data */
  blocks: VirtualBlock[];
  /** Render function for each block */
  renderBlock: (block: VirtualBlock, index: number, isVirtual: boolean) => React.ReactNode;
  /** Container height (required for virtualization) */
  containerHeight: number;
  /** Virtualization config */
  config?: Partial<VirtualizationConfig>;
  /** Callback when visible range changes */
  onVisibleRangeChange?: (startIndex: number, endIndex: number) => void;
  /** Callback when scroll position changes */
  onScroll?: (scrollTop: number) => void;
  /** Initial scroll position */
  initialScrollTop?: number;
  /** Class name for container */
  className?: string;
  /** Class name for virtual item wrapper */
  itemClassName?: string;
}

/** Virtualization metrics */
export interface VirtualizationMetrics {
  /** Total block count */
  totalBlocks: number;
  /** Currently rendered block count */
  renderedBlocks: number;
  /** Visible block count */
  visibleBlocks: number;
  /** Total virtual height */
  totalHeight: number;
  /** Current scroll position */
  scrollTop: number;
  /** Visible range */
  visibleRange: { start: number; end: number };
  /** Render efficiency (rendered / total) */
  efficiency: number;
}

// ============================================================================
// Default Configuration
// ============================================================================

const DEFAULT_CONFIG: VirtualizationConfig = {
  overscan: 5,
  defaultBlockHeight: 40,
  minBlockHeight: 24,
  maxBlockHeight: 2000,
  enableDynamicHeight: true,
  scrollDebounceMs: 16,
  enablePrefetch: true,
  prefetchDistance: 20,
};

// ============================================================================
// Hooks
// ============================================================================

/**
 * Hook for managing block height measurements.
 */
function useBlockHeights(blocks: VirtualBlock[], config: VirtualizationConfig) {
  const [measuredHeights, setMeasuredHeights] = React.useState<Map<string, number>>(new Map());

  const measureBlock = React.useCallback(
    (blockId: string, element: HTMLElement | null) => {
      if (!element || !config.enableDynamicHeight) {
        return;
      }

      const height = element.getBoundingClientRect().height;
      const clampedHeight = Math.max(
        config.minBlockHeight,
        Math.min(config.maxBlockHeight, height)
      );

      setMeasuredHeights((prev) => {
        if (prev.get(blockId) === clampedHeight) {
          return prev;
        }
        const next = new Map(prev);
        next.set(blockId, clampedHeight);
        return next;
      });
    },
    [config.enableDynamicHeight, config.minBlockHeight, config.maxBlockHeight]
  );

  const getBlockHeight = React.useCallback(
    (index: number): number => {
      const block = blocks[index];
      if (!block) {
        return config.defaultBlockHeight;
      }

      // Check measured height first
      const measured = measuredHeights.get(block.id);
      if (measured !== undefined) {
        return measured;
      }

      // Use estimated height from block data
      if (block.estimatedHeight) {
        return block.estimatedHeight;
      }

      // Fall back to default
      return config.defaultBlockHeight;
    },
    [blocks, measuredHeights, config.defaultBlockHeight]
  );

  return { measuredHeights, measureBlock, getBlockHeight };
}

/**
 * Hook for virtualization metrics.
 */
function useVirtualizationMetrics(
  virtualizer: ReturnType<typeof useVirtualizer<HTMLDivElement, Element>>,
  totalBlocks: number
): VirtualizationMetrics {
  return React.useMemo(() => {
    const virtualItems = virtualizer.getVirtualItems();
    const visibleRange = {
      start: virtualItems.length > 0 ? virtualItems[0].index : 0,
      end: virtualItems.length > 0 ? virtualItems[virtualItems.length - 1].index : 0,
    };

    return {
      totalBlocks,
      renderedBlocks: virtualItems.length,
      visibleBlocks: virtualItems.filter(
        (item) => item.index >= visibleRange.start && item.index <= visibleRange.end
      ).length,
      totalHeight: virtualizer.getTotalSize(),
      scrollTop: virtualizer.scrollOffset ?? 0,
      visibleRange,
      efficiency: totalBlocks > 0 ? 1 - virtualItems.length / totalBlocks : 1,
    };
  }, [virtualizer, totalBlocks]);
}

// ============================================================================
// Components
// ============================================================================

/**
 * Virtual block item wrapper.
 */
const VirtualBlockItem = React.memo(function VirtualBlockItem({
  block,
  index,
  start,
  measureBlock,
  renderBlock,
  className,
}: {
  block: VirtualBlock;
  index: number;
  start: number;
  measureBlock: (blockId: string, element: HTMLElement | null) => void;
  renderBlock: (block: VirtualBlock, index: number, isVirtual: boolean) => React.ReactNode;
  className?: string;
}) {
  const ref = React.useRef<HTMLDivElement>(null);

  // Measure height after render
  React.useLayoutEffect(() => {
    measureBlock(block.id, ref.current);
  }, [block.id, measureBlock]);

  return (
    <div
      ref={ref}
      className={className}
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        width: "100%",
        transform: `translateY(${start}px)`,
      }}
      data-block-id={block.id}
      data-block-index={index}
    >
      {renderBlock(block, index, true)}
    </div>
  );
});

/**
 * Virtualized Block List
 *
 * High-performance list component for rendering large documents.
 * Uses virtual scrolling to maintain consistent performance regardless of document size.
 */
export const VirtualizedBlockList = React.memo(function VirtualizedBlockList({
  blocks,
  renderBlock,
  containerHeight,
  config: configOverrides,
  onVisibleRangeChange,
  onScroll,
  initialScrollTop,
  className,
  itemClassName,
}: VirtualizedBlockListProps) {
  const config = React.useMemo(
    () => ({ ...DEFAULT_CONFIG, ...configOverrides }),
    [configOverrides]
  );

  const parentRef = React.useRef<HTMLDivElement>(null);

  // Block height management
  const { measureBlock, getBlockHeight } = useBlockHeights(blocks, config);

  // Initialize virtualizer
  const virtualizer = useVirtualizer({
    count: blocks.length,
    getScrollElement: () => parentRef.current,
    estimateSize: getBlockHeight,
    overscan: config.overscan,
    initialOffset: initialScrollTop,
  });

  // Metrics
  const metrics = useVirtualizationMetrics(virtualizer, blocks.length);

  // Track visible range changes
  React.useEffect(() => {
    if (onVisibleRangeChange) {
      onVisibleRangeChange(metrics.visibleRange.start, metrics.visibleRange.end);
    }
  }, [metrics.visibleRange.start, metrics.visibleRange.end, onVisibleRangeChange]);

  // Handle scroll
  const handleScroll = React.useCallback(
    (e: React.UIEvent<HTMLDivElement>) => {
      const scrollTop = e.currentTarget.scrollTop;
      onScroll?.(scrollTop);
    },
    [onScroll]
  );

  // Get virtual items
  const virtualItems = virtualizer.getVirtualItems();

  return (
    <div
      ref={parentRef}
      className={className}
      style={{
        height: containerHeight,
        overflow: "auto",
        contain: "strict",
      }}
      onScroll={handleScroll}
    >
      <div
        style={{
          height: virtualizer.getTotalSize(),
          width: "100%",
          position: "relative",
        }}
      >
        {virtualItems.map((virtualItem) => {
          const block = blocks[virtualItem.index];
          if (!block) {
            return null;
          }

          return (
            <VirtualBlockItem
              key={block.id}
              block={block}
              index={virtualItem.index}
              start={virtualItem.start}
              measureBlock={measureBlock}
              renderBlock={renderBlock}
              className={itemClassName}
            />
          );
        })}
      </div>
    </div>
  );
});

// ============================================================================
// Utilities
// ============================================================================

/**
 * Create block height estimator based on block type.
 */
export function createBlockHeightEstimator(
  typeHeights: Partial<Record<string, number>>
): (block: VirtualBlock) => number {
  const defaultHeight = 40;

  return (block: VirtualBlock): number => {
    return typeHeights[block.type] ?? defaultHeight;
  };
}

/**
 * Default block height estimates by type.
 */
export const DEFAULT_BLOCK_HEIGHTS: Record<string, number> = {
  paragraph: 40,
  heading: 60,
  quote: 80,
  code: 120,
  horizontal_rule: 24,
  table: 200,
  image: 300,
  video: 400,
  embed: 300,
};

/**
 * Hook to get virtualization metrics.
 */
export function useVirtualMetrics(
  ref: React.RefObject<{ getMetrics?: () => VirtualizationMetrics }>
) {
  const [metrics, setMetrics] = React.useState<VirtualizationMetrics | null>(null);

  React.useEffect(() => {
    const updateMetrics = () => {
      if (ref.current?.getMetrics) {
        setMetrics(ref.current.getMetrics());
      }
    };

    const interval = setInterval(updateMetrics, 1000);
    updateMetrics();

    return () => clearInterval(interval);
  }, [ref]);

  return metrics;
}

/**
 * Hook for scroll-to-block functionality.
 */
export function useScrollToBlock(
  virtualizerRef: React.RefObject<ReturnType<typeof useVirtualizer>>,
  blocks: VirtualBlock[]
) {
  return React.useCallback(
    (
      blockId: string,
      options?: { align?: "start" | "center" | "end"; behavior?: "auto" | "smooth" }
    ) => {
      const index = blocks.findIndex((b) => b.id === blockId);
      if (index === -1) {
        return;
      }

      virtualizerRef.current?.scrollToIndex(index, {
        align: options?.align ?? "center",
        behavior: options?.behavior ?? "smooth",
      });
    },
    [blocks, virtualizerRef]
  );
}
