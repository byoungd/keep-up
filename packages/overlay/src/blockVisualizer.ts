/**
 * LFCC v0.9 RC - Block Boundary Visualizer
 * @see docs/product/LFCC_v0.9_RC_Parallel_Workstreams/04_DevTools_Debug_Overlay.md Section B
 *
 * Renders block boundary overlays with IDs and container paths.
 * Platform-agnostic rendering data - actual DOM rendering is done by the UI layer.
 */

import type { BlockMeta, BlockOverlayData, BlockRect, OverlayCssTokens } from "./types";
import { DEFAULT_CSS_TOKENS } from "./types";

/** Block overlay render result */
export type BlockOverlayRenderResult = {
  overlays: BlockOverlayData[];
  cssStyles: string;
};

/**
 * Generate block overlay render data
 *
 * @param blockRects - Block bounding rectangles from the editor
 * @param blockMetas - Block metadata map
 * @param selectedBlockId - Currently selected block ID
 * @param tokens - CSS tokens for styling
 */
export function renderBlockOverlays(
  blockRects: BlockRect[],
  blockMetas: Map<string, BlockMeta>,
  selectedBlockId: string | null,
  tokens: OverlayCssTokens = DEFAULT_CSS_TOKENS
): BlockOverlayRenderResult {
  const overlays: BlockOverlayData[] = [];

  for (const rect of blockRects) {
    const meta = blockMetas.get(rect.blockId);
    if (!meta) {
      continue;
    }

    overlays.push({
      rect,
      meta,
      isSelected: rect.blockId === selectedBlockId,
      isDirty: meta.isDirty,
    });
  }

  // Sort by depth (nested blocks on top)
  overlays.sort((a, b) => {
    const depthA = a.meta.containerPath.split(" > ").length;
    const depthB = b.meta.containerPath.split(" > ").length;
    return depthA - depthB;
  });

  const cssStyles = generateBlockOverlayCss(tokens);

  return { overlays, cssStyles };
}

/**
 * Generate CSS for block overlays
 */
export function generateBlockOverlayCss(tokens: OverlayCssTokens): string {
  return `
.lfcc-block-overlay {
  position: absolute;
  pointer-events: none;
  border: 1px solid ${tokens.blockOutline};
  box-sizing: border-box;
  z-index: 9998;
}

.lfcc-block-overlay--dirty {
  border-color: ${tokens.dirtyHighlight};
  background: rgba(255, 152, 0, 0.1);
}

.lfcc-block-overlay--selected {
  border-color: ${tokens.selectedHighlight};
  border-width: 2px;
  background: rgba(0, 230, 118, 0.1);
}

.lfcc-block-label {
  position: absolute;
  top: -18px;
  left: 0;
  font-size: 10px;
  font-family: monospace;
  background: ${tokens.panelBg};
  color: ${tokens.textColor};
  padding: 1px 4px;
  border-radius: 2px;
  white-space: nowrap;
  max-width: 200px;
  overflow: hidden;
  text-overflow: ellipsis;
}

.lfcc-block-label--dirty {
  background: ${tokens.dirtyHighlight};
  color: #000;
}

.lfcc-block-path {
  position: absolute;
  bottom: -16px;
  left: 0;
  font-size: 9px;
  font-family: monospace;
  color: ${tokens.textColor};
  opacity: 0.7;
  white-space: nowrap;
}
`.trim();
}

/**
 * Generate inline style for a block overlay element
 */
export function getBlockOverlayStyle(overlay: BlockOverlayData): Record<string, string> {
  return {
    position: "absolute",
    left: `${overlay.rect.x}px`,
    top: `${overlay.rect.y}px`,
    width: `${overlay.rect.width}px`,
    height: `${overlay.rect.height}px`,
  };
}

/**
 * Get CSS class names for a block overlay
 */
export function getBlockOverlayClasses(overlay: BlockOverlayData): string[] {
  const classes = ["lfcc-block-overlay"];
  if (overlay.isDirty) {
    classes.push("lfcc-block-overlay--dirty");
  }
  if (overlay.isSelected) {
    classes.push("lfcc-block-overlay--selected");
  }
  return classes;
}

/**
 * Format block label text
 */
export function formatBlockLabel(meta: BlockMeta): string {
  return `${meta.type} [${meta.blockId.slice(0, 8)}...]`;
}

/**
 * Format container path for display
 */
export function formatContainerPath(meta: BlockMeta): string {
  return meta.containerPath;
}

/**
 * Build container path from parent chain
 */
export function buildContainerPath(
  blockId: string,
  parentMap: Map<string, string>,
  typeMap: Map<string, string>
): string[] {
  const path: string[] = [];
  let currentId: string | undefined = parentMap.get(blockId);

  while (currentId) {
    const type = typeMap.get(currentId) ?? "unknown";
    path.unshift(type);
    currentId = parentMap.get(currentId);
  }

  return path;
}

/**
 * Find dirty blocks from dirty info
 */
export function extractDirtyBlockIds(dirtyInfo: {
  dirty_block_ids?: string[];
  dirty_span_ids?: string[];
}): Set<string> {
  return new Set(dirtyInfo.dirty_block_ids ?? []);
}

/**
 * Calculate block depth for z-index ordering
 */
export function calculateBlockDepth(containerPath: string): number {
  if (!containerPath || containerPath === "(root)") {
    return 0;
  }
  return containerPath.split(" > ").length;
}
