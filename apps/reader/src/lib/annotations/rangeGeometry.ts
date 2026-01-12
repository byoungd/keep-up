import type { EditorView } from "prosemirror-view";

/**
 * Geometry information for a text range, used for rendering overlays.
 */
export interface RangeGeometry {
  rects: DOMRect[];
  startCoords: { left: number; top: number; bottom: number };
  endCoords: { left: number; top: number; bottom: number };
}

let _cacheMisses = 0;

/** For debugging: Get cache miss count */
export function getRangeGeometryCacheMisses(): number {
  return _cacheMisses;
}

/**
 * Compute geometry by walking text nodes directly.
 * Bypasses ProseMirror's domAtPos which returns wrong nodes when cursor is present.
 *
 * Strategy:
 * 1. Get the text content for the range from ProseMirror
 * 2. Walk all text nodes in the editor DOM
 * 3. Find the text nodes that contain our target content
 * 4. Create a Range and get client rects
 */
function computeGeometryViaTextWalk(
  view: EditorView,
  from: number,
  to: number
): RangeGeometry | null {
  try {
    // Get the actual text content we're looking for
    const targetText = view.state.doc.textBetween(from, to);
    if (!targetText) {
      return null;
    }

    // Find the paragraph element containing this position
    // Use coordsAtPos to get approximate location, then find the text node
    const approxCoords = view.coordsAtPos(from);
    const elemAtPoint = document.elementFromPoint(approxCoords.left + 5, approxCoords.top + 5);
    if (!elemAtPoint) {
      return null;
    }

    // Find the closest paragraph or text block
    const textBlock =
      elemAtPoint.closest("p, h1, h2, h3, h4, h5, h6, li, blockquote, [data-node-type]") ??
      elemAtPoint;

    // Use helper to find correct text nodes
    const rangeNodes = findTextNodesForRange(view, textBlock, targetText, from);
    if (!rangeNodes) {
      return null;
    }
    const { startNode, startOffset, endNode, endOffset } = rangeNodes;

    // Create range and get rects
    const range = document.createRange();
    range.setStart(startNode, Math.min(startOffset, startNode.length));
    range.setEnd(endNode, Math.min(endOffset, endNode.length));

    if (range.collapsed) {
      return null;
    }

    const clientRects = Array.from(range.getClientRects());
    const validRects = clientRects.filter((rect) => rect.width > 0 && rect.height > 0);

    if (validRects.length === 0) {
      return null;
    }

    // Use first and last rect for start/end coords
    const firstRect = validRects[0];
    const lastRect = validRects[validRects.length - 1];

    return {
      rects: validRects,
      startCoords: {
        left: firstRect.left,
        top: firstRect.top,
        bottom: firstRect.bottom,
      },
      endCoords: {
        left: lastRect.right,
        top: lastRect.top,
        bottom: lastRect.bottom,
      },
    };
  } catch {
    return null;
  }
}

/**
 * Compute geometry for a range using coordsAtPos.
 * This is the most reliable method as it doesn't depend on DOM structure.
 *
 * For multi-line text, it iterates through each position to build
 * accurate rectangles for each line.
 */
function computeGeometryViaCoords(
  view: EditorView,
  from: number,
  to: number
): RangeGeometry | null {
  const startCoords = view.coordsAtPos(from);
  const endCoords = view.coordsAtPos(to, 1);

  // Validate coordinates
  if (
    !Number.isFinite(startCoords.left) ||
    !Number.isFinite(startCoords.top) ||
    !Number.isFinite(endCoords.right) ||
    !Number.isFinite(endCoords.top)
  ) {
    return null;
  }

  // Check if it's a single-line range (start and end on same line)
  const isSingleLine =
    Math.abs(startCoords.top - endCoords.top) < 5 &&
    Math.abs(startCoords.bottom - endCoords.bottom) < 5;

  if (isSingleLine) {
    // Simple case: single rectangle
    const rect = new DOMRect(
      startCoords.left,
      startCoords.top,
      Math.max(1, endCoords.right - startCoords.left),
      startCoords.bottom - startCoords.top
    );
    return { rects: [rect], startCoords, endCoords };
  }

  // Multi-line range: build rectangles for each line
  const rects: DOMRect[] = [];
  const editorRect = view.dom.getBoundingClientRect();
  const editorRight = editorRect.right - 8; // Slight padding from edge

  // First line: from startCoords.left to edge
  rects.push(
    new DOMRect(
      startCoords.left,
      startCoords.top,
      Math.max(1, editorRight - startCoords.left),
      startCoords.bottom - startCoords.top
    )
  );

  // Middle lines (if any): scan through positions to detect line breaks
  let currentTop = startCoords.bottom;
  let pos = from + 1;

  while (pos < to) {
    const coords = view.coordsAtPos(pos);

    // Moving to a new line?
    if (coords.top > currentTop + 2) {
      // Check if this is still before the last line
      if (Math.abs(coords.top - endCoords.top) > 5) {
        // This is a middle line
        rects.push(
          new DOMRect(
            editorRect.left + 8, // Slight padding
            coords.top,
            Math.max(1, editorRight - (editorRect.left + 8)),
            coords.bottom - coords.top
          )
        );
        currentTop = coords.bottom;
      } else {
        // Reached the last line, break
        break;
      }
    }

    // Skip by character clusters for efficiency
    pos += Math.max(1, Math.floor((to - from) / 20));
    if (pos >= to) {
      break;
    }
  }

  // Last line: from edge to endCoords.right
  if (Math.abs(endCoords.top - startCoords.top) > 5) {
    rects.push(
      new DOMRect(
        editorRect.left + 8,
        endCoords.top,
        Math.max(1, endCoords.right - (editorRect.left + 8)),
        endCoords.bottom - endCoords.top
      )
    );
  }

  return { rects, startCoords, endCoords };
}

/**
 * Try to compute geometry via DOM range for maximum accuracy
 * when available. Falls back to coordsAtPos if DOM fails.
 */
function computeGeometryViaDom(
  view: EditorView,
  from: number,
  to: number,
  startCoords: { left: number; top: number; bottom: number; right: number },
  endCoords: { left: number; top: number; bottom: number; right: number }
): RangeGeometry | null {
  try {
    const domStart = view.domAtPos(from, 1);
    const domEnd = view.domAtPos(to, -1);

    if (!domStart.node || !domEnd.node) {
      return null;
    }

    const startPos = findTextPosition(domStart.node, domStart.offset, "start");
    const endPos = findTextPosition(domEnd.node, domEnd.offset, "end");
    const range = document.createRange();

    range.setStart(startPos.node, startPos.offset);
    range.setEnd(endPos.node, endPos.offset);

    if (range.collapsed) {
      return null;
    }

    const clientRects = Array.from(range.getClientRects());
    const editorRect = view.dom.getBoundingClientRect();
    const maxReasonableWidth = editorRect.width * 0.95;

    const validRects = clientRects.filter((rect) => {
      if (rect.width <= 0 || rect.height <= 0) {
        return false;
      }
      // Filter out full-line rects in multi-rect scenarios (browser artifact)
      if (clientRects.length > 1 && rect.width > maxReasonableWidth) {
        return false;
      }
      return true;
    });

    if (validRects.length === 0) {
      return null;
    }

    return { rects: validRects, startCoords, endCoords };
  } catch {
    return null;
  }
}

/**
 * Compute geometry for a text range.
 *
 * Strategy:
 * 1. Always get startCoords and endCoords via coordsAtPos (most reliable)
 * 2. Try DOM range approach for accurate multi-line rects
 * 3. Fall back to coordsAtPos-based rect calculation if DOM fails
 */
export function computeRangeGeometry(
  view: EditorView,
  from: number,
  to: number
): RangeGeometry | null {
  if (from >= to || !view.dom.isConnected) {
    return null;
  }
  _cacheMisses++;

  // Clamp positions to valid document range
  const docSize = view.state.doc.content.size;
  const safeFrom = Math.max(0, Math.min(from, docSize));
  const safeTo = Math.max(safeFrom, Math.min(to, docSize));

  if (safeFrom >= safeTo) {
    return null;
  }

  try {
    // Get coordinates - this is always reliable
    const startCoords = view.coordsAtPos(safeFrom);
    const endCoords = view.coordsAtPos(safeTo, 1);

    // Validate coordinates
    if (
      !Number.isFinite(startCoords.left) ||
      !Number.isFinite(startCoords.top) ||
      !Number.isFinite(endCoords.right) ||
      !Number.isFinite(endCoords.top)
    ) {
      return null;
    }

    // FIX: When cursor is present, ProseMirror's domAtPos returns parent DIV instead of #text,
    // which breaks both DOM-based and coords-based methods (coordsAtPos uses domAtPos internally).
    // Use direct text walk method to find correct DOM positions.
    const hasCursor = !view.state.selection.empty;

    if (hasCursor) {
      // Use text walk method that bypasses ProseMirror's broken DOM mapping
      const textWalkResult = computeGeometryViaTextWalk(view, safeFrom, safeTo);
      if (textWalkResult) {
        return textWalkResult;
      }
      // Fall through to other methods if text walk fails
    }

    // Try DOM-based approach first (more accurate for multi-line) - works when no cursor
    const domResult = computeGeometryViaDom(view, safeFrom, safeTo, startCoords, endCoords);
    if (domResult) {
      return domResult;
    }

    // Fall back to coords-based calculation
    return computeGeometryViaCoords(view, safeFrom, safeTo);
  } catch {
    return null;
  }
}

// --- Helper functions ---

/**
 * Robustly find text nodes corresponding to target text.
 * Handles repeated occurrences by verifying position with posAtDOM.
 */
/**
 * Helper to map a text offset range to start/end nodes.
 */
function mapIndexToNodes(
  textNodes: Text[],
  startIndex: number,
  length: number
): { startNode: Text; startOffset: number; endNode: Text; endOffset: number } | null {
  let currentIdx = 0;
  let startNode: Text | null = null;
  let startOffset = 0;
  let endNode: Text | null = null;
  let endOffset = 0;
  const endIndex = startIndex + length;

  for (const node of textNodes) {
    const len = node.length;
    const endIdx = currentIdx + len;

    if (!startNode && currentIdx <= startIndex && endIdx > startIndex) {
      startNode = node;
      startOffset = startIndex - currentIdx;
    }

    if (currentIdx < endIndex && endIdx >= endIndex) {
      endNode = node;
      endOffset = endIndex - currentIdx;
    }

    currentIdx = endIdx;
    if (startNode && endNode) {
      break;
    }
  }

  if (startNode && endNode) {
    return { startNode, startOffset, endNode, endOffset };
  }
  return null;
}

/**
 * Robustly find text nodes corresponding to target text.
 * Handles repeated occurrences by verifying position with posAtDOM.
 */
function findTextNodesForRange(
  view: EditorView,
  textBlock: Element,
  targetText: string,
  expectedFrom: number
): { startNode: Text; startOffset: number; endNode: Text; endOffset: number } | null {
  const walker = document.createTreeWalker(textBlock, NodeFilter.SHOW_TEXT);
  const textNodes: Text[] = [];

  // Collect all text nodes
  for (;;) {
    const node = walker.nextNode() as Text | null;
    if (!node) {
      break;
    }
    textNodes.push(node);
  }

  if (textNodes.length === 0) {
    return null;
  }

  const blockText = textNodes.map((n) => n.textContent || "").join("");
  let searchIndex = 0;

  // Search for all occurrences
  while (true) {
    const index = blockText.indexOf(targetText, searchIndex);
    if (index === -1) {
      return null;
    } // No more matches

    const rangeNodes = mapIndexToNodes(textNodes, index, targetText.length);

    if (rangeNodes) {
      // Verify this is the correct occurrence by checking document position
      try {
        const domPos = view.posAtDOM(rangeNodes.startNode, rangeNodes.startOffset);
        // Allow small drift (e.g. 1-2 positions) due to normalization
        if (Math.abs(domPos - expectedFrom) <= 2) {
          return rangeNodes;
        }
      } catch {
        // Ignore posAtDOM errors
      }
    }

    // Try next occurrence
    searchIndex = index + 1;
  }
}

function findTextPosition(
  node: Node,
  offset: number,
  direction: "start" | "end"
): { node: Node; offset: number } {
  const childNodes = node.childNodes;
  if (childNodes.length === 0) {
    // This is a text node or empty node
    if (node.nodeType === Node.TEXT_NODE) {
      const length = (node as Text).length;
      return { node, offset: Math.min(offset, length) };
    }
    return { node, offset: 0 };
  }

  const safeOffset = Math.min(offset, childNodes.length);

  if (direction === "start") {
    return findStartTextPosition(node, childNodes, safeOffset);
  }
  return findEndTextPosition(node, childNodes, safeOffset);
}

function findStartTextPosition(
  node: Node,
  childNodes: NodeListOf<ChildNode>,
  safeOffset: number
): { node: Node; offset: number } {
  if (safeOffset >= childNodes.length) {
    return { node, offset: safeOffset };
  }
  const child = childNodes[safeOffset];
  if (child.nodeType === Node.TEXT_NODE) {
    return { node: child, offset: 0 };
  }
  if (child.nodeType === Node.ELEMENT_NODE) {
    return findTextPosition(child, 0, "start");
  }
  return { node, offset: safeOffset };
}

function findEndTextPosition(
  node: Node,
  childNodes: NodeListOf<ChildNode>,
  safeOffset: number
): { node: Node; offset: number } {
  if (safeOffset === 0) {
    return { node, offset: 0 };
  }
  const childIndex = Math.min(safeOffset - 1, childNodes.length - 1);
  const child = childNodes[childIndex];
  if (child.nodeType === Node.TEXT_NODE) {
    return { node: child, offset: (child as Text).length };
  }
  if (child.nodeType === Node.ELEMENT_NODE) {
    const lastChild = child.childNodes.length;
    return findTextPosition(child, lastChild, "end");
  }
  return { node, offset: safeOffset };
}
