import { type Anchor, anchorFromAbsolute } from "../kernel/anchors";

export interface SelectionResult {
  start: Anchor;
  end: Anchor;
  text: string;
  /** Bounding rect of the selection, captured at mouseup time (viewport coords) */
  rect: DOMRect;
}

/**
 * Captures the current DOM selection and maps it to Kernel Anchors.
 * This implementation assumes that blocks have a `data-block-id` attribute.
 */
export function captureSelection(): SelectionResult | null {
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed || selection.rangeCount === 0) {
    return null;
  }

  const range = selection.getRangeAt(0);
  const rect = range.getBoundingClientRect();

  const startNode = range.startContainer;
  const endNode = range.endContainer;

  const startBlock = findParentBlock(startNode);
  const endBlock = findParentBlock(endNode);

  if (!startBlock || !endBlock) {
    return null;
  }

  const startBlockId = startBlock.getAttribute("data-block-id");
  const endBlockId = endBlock.getAttribute("data-block-id");

  if (!startBlockId || !endBlockId) {
    return null;
  }

  // Offset calculation is simplistic here (text offset within block)
  // In a real implementation, this needs to handle nested elements.
  const startOffset = calculateOffsetWithinBlock(startBlock, startNode, range.startOffset);
  const endOffset = calculateOffsetWithinBlock(endBlock, endNode, range.endOffset);

  return {
    start: anchorFromAbsolute(startBlockId, startOffset, "after"),
    end: anchorFromAbsolute(endBlockId, endOffset, "before"),
    text: selection.toString(),
    rect, // Capture rect at same moment as selection
  };
}

function findParentBlock(node: Node): HTMLElement | null {
  let curr: Node | null = node;
  while (curr) {
    if (curr instanceof HTMLElement && curr.hasAttribute("data-block-id")) {
      return curr;
    }
    curr = curr.parentNode;
  }
  return null;
}

function calculateOffsetWithinBlock(block: HTMLElement, node: Node, nodeOffset: number): number {
  // Walk the DOM tree from block start to node
  let offset = 0;
  const walk = (curr: Node): boolean => {
    if (curr === node) {
      offset += nodeOffset;
      return true;
    }
    if (curr.nodeType === Node.TEXT_NODE) {
      offset += (curr as Text).length;
    }
    for (let i = 0; i < curr.childNodes.length; i++) {
      if (walk(curr.childNodes[i])) {
        return true;
      }
    }
    return false;
  };
  walk(block);
  return offset;
}
