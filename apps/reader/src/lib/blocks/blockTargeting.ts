/**
 * Block Handle Targeting Utilities
 *
 * Implements container-aware targeting policy for block handles.
 * Default policy: "container-first" - when hovering inside a container block
 * (e.g., blockquote), target the container rather than inner leaf blocks.
 */

import type { EditorView } from "prosemirror-view";

export type HandleTargetPolicy = "container-first" | "leaf-first";

export interface HandleTarget {
  /** The resolved target block ID */
  blockId: string;
  /** Position in the ProseMirror document */
  blockPos: number;
  /** The DOM element for this block */
  dom: Element;
  /** Debug reason for why this target was selected */
  reason: string;
  /** The policy that was applied */
  policy: HandleTargetPolicy;
}

/**
 * Container block types that should be targeted as a whole unit.
 * Using tag names and data attributes for detection.
 */
const CONTAINER_TAGS = new Set(["BLOCKQUOTE"]);
const CONTAINER_TYPES = new Set(["blockquote", "callout", "toggle"]);

/**
 * Check if an element is a container block that should be targeted as a unit.
 * Uses data attributes first (future-proof), then falls back to tag names.
 */
export function isContainerBlockDom(el: Element): boolean {
  // Check data-block-type or data-node-type attributes first
  const blockType = el.getAttribute("data-block-type");
  if (blockType && CONTAINER_TYPES.has(blockType)) {
    return true;
  }

  const nodeType = el.getAttribute("data-node-type");
  if (nodeType && CONTAINER_TYPES.has(nodeType)) {
    return true;
  }

  // Fallback to tag name detection for blockquote
  if (CONTAINER_TAGS.has(el.tagName)) {
    return true;
  }

  return false;
}

/**
 * Extract block ID from a DOM element.
 */
export function getBlockIdFromDom(el: Element): string | null {
  return el.getAttribute("data-block-id");
}

/**
 * Find the nearest ancestor container block with a block ID.
 * Returns null if no container with block ID is found.
 */
function findAncestorContainer(
  el: Element,
  editorRoot: Element
): { el: Element; blockId: string } | null {
  let current: Element | null = el.parentElement;

  while (current && current !== editorRoot && !current.classList.contains("ProseMirror")) {
    const blockId = getBlockIdFromDom(current);
    if (blockId && isContainerBlockDom(current)) {
      return { el: current, blockId };
    }
    current = current.parentElement;
  }

  return null;
}

/**
 * Find the block at a ProseMirror position.
 * Returns the nearest block element with a block ID.
 */
function findBlockAtPos(
  view: EditorView,
  pos: number
): { el: Element; blockId: string; blockPos: number } | null {
  const $pos = view.state.doc.resolve(pos);

  // Iterate from depth down to 0 to find block with block_id
  for (let d = $pos.depth; d >= 0; d--) {
    const node = $pos.node(d);
    if (node.isBlock && node.attrs.block_id) {
      const blockPos = $pos.before(d);
      const blockId = node.attrs.block_id as string;
      const dom = view.nodeDOM(blockPos);

      if (dom instanceof Element) {
        return { el: dom, blockId, blockPos };
      }
    }
  }

  return null;
}

/**
 * Main targeting function: resolves the handle target based on policy.
 *
 * @param view - ProseMirror EditorView
 * @param pos - Document position from mouse coordinates
 * @param policy - Targeting policy (default: "container-first")
 * @returns HandleTarget or null if no valid target found
 */
export function findHandleTarget(
  view: EditorView,
  pos: number,
  policy: HandleTargetPolicy = "container-first"
): HandleTarget | null {
  // Step 1: Find the leaf block at this position
  const leafBlock = findBlockAtPos(view, pos);
  if (!leafBlock) {
    return null;
  }

  // Step 2: If leaf-first policy, return the leaf immediately
  if (policy === "leaf-first") {
    return {
      blockId: leafBlock.blockId,
      blockPos: leafBlock.blockPos,
      dom: leafBlock.el,
      reason: "leaf-first policy: returning nearest block",
      policy,
    };
  }

  // Step 3: Container-first policy - look for ancestor container
  const editorRoot = view.dom;
  const container = findAncestorContainer(leafBlock.el, editorRoot);

  if (container) {
    // Find the container's position in the document
    // We need to walk the document to find it
    let containerPos: number | null = null;
    view.state.doc.descendants((node, nodePos) => {
      if (node.attrs.block_id === container.blockId) {
        containerPos = nodePos;
        return false; // Stop searching
      }
      return true;
    });

    if (containerPos !== null) {
      return {
        blockId: container.blockId,
        blockPos: containerPos,
        dom: container.el,
        reason: `container-first: found ancestor ${container.el.tagName.toLowerCase()}`,
        policy,
      };
    }
  }

  // Step 4: No container found, fall back to leaf
  return {
    blockId: leafBlock.blockId,
    blockPos: leafBlock.blockPos,
    dom: leafBlock.el,
    reason: "container-first fallback: no container ancestor",
    policy,
  };
}

/**
 * Get handle target from mouse coordinates.
 * Convenience wrapper that converts coords to pos first.
 */
// Fallback distance to check into the content if hovering gutter
const GUTTER_FALLBACK_X_OFFSET = 85;

/**
 * Get handle target from mouse coordinates.
 * Convenience wrapper that converts coords to pos first.
 * Includes gutter tolerance: if clicking/hovering in the left gutter,
 * it projects the coordinate into the content area.
 */
export function getHandleTargetFromCoords(
  view: EditorView,
  coords: { left: number; top: number },
  policy: HandleTargetPolicy = "container-first"
): HandleTarget | null {
  let posInfo = view.posAtCoords(coords);

  // If strict hit test fails (e.g. in padding/gutter), try projecting X coordinate
  if (!posInfo) {
    const editorRect = view.dom.getBoundingClientRect();
    // Only try fallback if we are strictly to the left of the center (assuming LTR)
    // or specifically within our known gutter area
    if (coords.left < editorRect.left + GUTTER_FALLBACK_X_OFFSET) {
      // Try probing at the same Y, but slightly inside the content area
      // We use padding-left (~72px) so we probe at left + 80px to be safe?
      // Or just left + offset.
      const fallbackCoords = {
        left: editorRect.left + GUTTER_FALLBACK_X_OFFSET,
        top: coords.top,
      };
      posInfo = view.posAtCoords(fallbackCoords);
    }
  }

  if (!posInfo) {
    return null;
  }

  return findHandleTarget(view, posInfo.pos, policy);
}
