"use client";

/**
 * Virtualized Editor Hook
 *
 * P1.3: Integration hook for connecting virtualization with ProseMirror.
 * Manages block extraction, height estimation, and scroll synchronization.
 */

import type { EditorState } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";
import * as React from "react";

import {
  DEFAULT_BLOCK_HEIGHTS,
  type VirtualBlock,
  type VirtualizationConfig,
  type VirtualizationMetrics,
} from "./VirtualizedBlockList";

// ============================================================================
// Types
// ============================================================================

/** Virtualized editor options */
export interface VirtualizedEditorOptions {
  /** Minimum block count to enable virtualization */
  minBlocksForVirtualization: number;
  /** Virtualization configuration */
  config: Partial<VirtualizationConfig>;
  /** Custom block height estimator */
  estimateBlockHeight?: (block: VirtualBlock) => number;
  /** Callback when virtualization state changes */
  onVirtualizationChange?: (enabled: boolean, reason: string) => void;
  /** Callback when metrics update */
  onMetricsUpdate?: (metrics: VirtualizationMetrics) => void;
}

/** Virtualized editor state */
export interface VirtualizedEditorState {
  /** Whether virtualization is enabled */
  isVirtualized: boolean;
  /** Reason for virtualization state */
  reason: string;
  /** Extracted blocks */
  blocks: VirtualBlock[];
  /** Visible block IDs */
  visibleBlockIds: Set<string>;
  /** Current scroll position */
  scrollTop: number;
  /** Total document height (estimated) */
  totalHeight: number;
  /** Metrics */
  metrics: VirtualizationMetrics | null;
}

/** Block extraction result */
interface BlockExtractionResult {
  blocks: VirtualBlock[];
  totalHeight: number;
}

// ============================================================================
// Default Configuration
// ============================================================================

const DEFAULT_OPTIONS: VirtualizedEditorOptions = {
  minBlocksForVirtualization: 2000, // Enable virtualization only for very large docs (>2000 blocks) to prevent "dancing cursor" issues
  config: {
    overscan: 5,
    defaultBlockHeight: 40,
    enableDynamicHeight: true,
    prefetchDistance: 20,
  },
};

// ============================================================================
// Block Extraction
// ============================================================================

/**
 * Extract blocks from ProseMirror document.
 */
function extractBlocks(
  state: EditorState,
  estimateHeight: (block: VirtualBlock) => number
): BlockExtractionResult {
  const blocks: VirtualBlock[] = [];
  let totalHeight = 0;

  const doc = state.doc;

  // Iterate through top-level nodes
  doc.forEach((node, _offset, index) => {
    const blockId = node.attrs?.blockId || `block-${index}`;
    const blockType = node.type.name;

    const block: VirtualBlock = {
      id: blockId,
      type: blockType,
      estimatedHeight: 0,
      content: {
        type: blockType,
        textContent: node.textContent.slice(0, 100), // Preview only
        childCount: node.childCount,
      },
    };

    // Estimate height
    block.estimatedHeight = estimateHeight(block);
    totalHeight += block.estimatedHeight;

    blocks.push(block);
  });

  return { blocks, totalHeight };
}

/**
 * Default height estimator based on block type.
 */
function defaultEstimateHeight(block: VirtualBlock): number {
  // Check type-specific heights
  const typeHeight = DEFAULT_BLOCK_HEIGHTS[block.type];
  if (typeHeight !== undefined) {
    return typeHeight;
  }

  // Estimate based on content length
  const content = block.content as { textContent?: string } | undefined;
  if (content?.textContent) {
    const charCount = content.textContent.length;
    // Rough estimate: 60 chars per line, 20px per line
    const lines = Math.max(1, Math.ceil(charCount / 60));
    return Math.min(2000, 20 + lines * 20);
  }

  return 40; // Default height
}

// ============================================================================
// Hooks
// ============================================================================

/**
 * Hook for virtualized editor integration.
 *
 * Usage:
 * ```tsx
 * const { isVirtualized, blocks, handleScroll } = useVirtualizedEditor(editorState, {
 *   minBlocksForVirtualization: 100,
 * });
 *
 * if (isVirtualized) {
 *   return <VirtualizedBlockList blocks={blocks} ... />;
 * }
 *
 * return <StandardEditor />;
 * ```
 */
export function useVirtualizedEditor(
  editorState: EditorState | null,
  editorView: EditorView | null,
  options: Partial<VirtualizedEditorOptions> = {}
): VirtualizedEditorState & {
  handleScroll: (scrollTop: number) => void;
  handleVisibleRangeChange: (startIndex: number, endIndex: number) => void;
  scrollToBlock: (blockId: string) => void;
} {
  const opts = React.useMemo(() => ({ ...DEFAULT_OPTIONS, ...options }), [options]);

  // Memoize height estimator
  const estimateHeight = React.useCallback(
    (block: VirtualBlock) => {
      if (opts.estimateBlockHeight) {
        return opts.estimateBlockHeight(block);
      }
      return defaultEstimateHeight(block);
    },
    [opts]
  );

  // Extract blocks from state
  const extraction = React.useMemo((): BlockExtractionResult => {
    if (!editorState) {
      return { blocks: [], totalHeight: 0 };
    }
    return extractBlocks(editorState, estimateHeight);
  }, [editorState, estimateHeight]);

  // Determine if virtualization should be enabled
  const shouldVirtualize = extraction.blocks.length >= opts.minBlocksForVirtualization;

  // Track visible blocks
  const [visibleBlockIds, setVisibleBlockIds] = React.useState<Set<string>>(new Set());
  const [scrollTop, setScrollTop] = React.useState(0);
  const [metrics, _setMetrics] = React.useState<VirtualizationMetrics | null>(null);

  // Handle scroll position changes
  const handleScroll = React.useCallback((newScrollTop: number) => {
    setScrollTop(newScrollTop);
  }, []);

  // Handle visible range changes
  const handleVisibleRangeChange = React.useCallback(
    (startIndex: number, endIndex: number) => {
      const newVisible = new Set<string>();
      for (let i = startIndex; i <= endIndex; i++) {
        const block = extraction.blocks[i];
        if (block) {
          newVisible.add(block.id);
        }
      }
      setVisibleBlockIds(newVisible);
    },
    [extraction.blocks]
  );

  // Scroll to specific block
  const scrollToBlock = React.useCallback(
    (blockId: string) => {
      if (!editorView) {
        return;
      }

      // Find block position in document
      const doc = editorView.state.doc;
      let targetPos = 0;
      let found = false;

      doc.forEach((node, offset) => {
        if (node.attrs?.blockId === blockId) {
          targetPos = offset;
          found = true;
          return false; // Stop iteration
        }
      });

      if (found) {
        // Scroll ProseMirror view to position
        const coords = editorView.coordsAtPos(targetPos);
        const container = editorView.dom.parentElement;
        if (container && coords) {
          container.scrollTo({
            top: coords.top - container.getBoundingClientRect().top + container.scrollTop - 100,
            behavior: "smooth",
          });
        }
      }
    },
    [editorView]
  );

  // Notify when virtualization state changes
  React.useEffect(() => {
    const reason = shouldVirtualize
      ? `${extraction.blocks.length} blocks exceeds threshold of ${opts.minBlocksForVirtualization}`
      : `${extraction.blocks.length} blocks below threshold of ${opts.minBlocksForVirtualization}`;

    opts.onVirtualizationChange?.(shouldVirtualize, reason);
  }, [shouldVirtualize, extraction.blocks.length, opts]);

  // Notify when metrics update
  React.useEffect(() => {
    if (metrics) {
      opts.onMetricsUpdate?.(metrics);
    }
  }, [metrics, opts]);

  return {
    isVirtualized: shouldVirtualize,
    reason: shouldVirtualize
      ? `Virtualization enabled for ${extraction.blocks.length} blocks`
      : `Standard rendering for ${extraction.blocks.length} blocks`,
    blocks: extraction.blocks,
    visibleBlockIds,
    scrollTop,
    totalHeight: extraction.totalHeight,
    metrics,
    handleScroll,
    handleVisibleRangeChange,
    scrollToBlock,
  };
}

/**
 * Hook for tracking virtualization performance.
 */
export function useVirtualizationPerformance(isVirtualized: boolean, blockCount: number) {
  const [frameTime, setFrameTime] = React.useState(0);
  const [fps, setFps] = React.useState(60);
  const lastFrameRef = React.useRef(performance.now());
  const frameCountRef = React.useRef(0);

  React.useEffect(() => {
    if (!isVirtualized) {
      return;
    }

    let animationId: number;

    const measureFrame = () => {
      const now = performance.now();
      const delta = now - lastFrameRef.current;
      lastFrameRef.current = now;
      frameCountRef.current++;

      setFrameTime(delta);

      // Calculate FPS every second
      if (frameCountRef.current % 60 === 0) {
        setFps(Math.round(1000 / delta));
      }

      animationId = requestAnimationFrame(measureFrame);
    };

    animationId = requestAnimationFrame(measureFrame);

    return () => {
      cancelAnimationFrame(animationId);
    };
  }, [isVirtualized]);

  return {
    isVirtualized,
    blockCount,
    frameTime,
    fps,
    isPerformant: fps >= 50,
  };
}

/**
 * Hook for managing visible block prefetching.
 */
export function useBlockPrefetch(
  blocks: VirtualBlock[],
  visibleBlockIds: Set<string>,
  prefetchDistance: number,
  onPrefetch: (blockIds: string[]) => void
) {
  React.useEffect(() => {
    if (visibleBlockIds.size === 0) {
      return;
    }

    // Find visible range
    const visibleIndices: number[] = [];
    blocks.forEach((block, index) => {
      if (visibleBlockIds.has(block.id)) {
        visibleIndices.push(index);
      }
    });

    if (visibleIndices.length === 0) {
      return;
    }

    const minIndex = Math.min(...visibleIndices);
    const maxIndex = Math.max(...visibleIndices);

    // Calculate prefetch range
    const prefetchStart = Math.max(0, minIndex - prefetchDistance);
    const prefetchEnd = Math.min(blocks.length - 1, maxIndex + prefetchDistance);

    // Get block IDs to prefetch (not currently visible)
    const prefetchIds: string[] = [];
    for (let i = prefetchStart; i <= prefetchEnd; i++) {
      const block = blocks[i];
      if (block && !visibleBlockIds.has(block.id)) {
        prefetchIds.push(block.id);
      }
    }

    if (prefetchIds.length > 0) {
      onPrefetch(prefetchIds);
    }
  }, [blocks, visibleBlockIds, prefetchDistance, onPrefetch]);
}
