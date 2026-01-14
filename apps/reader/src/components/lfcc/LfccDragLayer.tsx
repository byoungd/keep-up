import {
  DndContext,
  type DragEndEvent,
  type DragMoveEvent,
  DragOverlay,
  type DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import type { Node as PMNode, ResolvedPos } from "prosemirror-model";
import type { EditorView } from "prosemirror-view";
import * as React from "react";
import { createPortal } from "react-dom";

import { AnnotationDragOverlay } from "@/components/annotations/AnnotationDragOverlay";
import { BRIDGE_ORIGIN_META } from "@ku0/lfcc-bridge";
// Removed HighlightOverlay import as it's now rendered in page.tsx
import { useLfccEditorContext } from "./LfccEditorContext";

// Custom sensor that only activates on specific handles
class CustomPointerSensor extends PointerSensor {
  static activators = [
    {
      eventName: "onPointerDown" as const,
      handler: ({ nativeEvent: event }: { nativeEvent: PointerEvent }) => {
        if (!event.isPrimary || event.button !== 0) {
          return false;
        }

        const target = event.target as HTMLElement;
        // Only activate if clicking explicitly on our handle
        // This prevents dnd-kit from intercepting text selection events elsewhere
        return !!target.closest(".lfcc-block-drag-handle");
      },
    },
  ];
}

// Helper to find block by ID in document
function findBlockById(view: EditorView, id: string): { pos: number; node: PMNode } | null {
  let found: { pos: number; node: PMNode } | null = null;
  view.state.doc.descendants((node, pos) => {
    if (found) {
      return false;
    }
    if (node.isBlock && node.attrs.block_id === id) {
      found = { pos, node };
      return false;
    }
    return true;
  });
  return found;
}

// Get text content preview from a node
function getBlockPreview(node: PMNode): string {
  const text = node.textContent;
  if (!text) {
    return "Empty block";
  }
  return text.slice(0, 50) + (text.length > 50 ? "..." : "");
}

// Find closest block by Y position when cursor is outside editor bounds
function findClosestBlockByY(
  view: EditorView,
  dropY: number
): { pos: number; rect: DOMRect; isAbove: boolean } | null {
  let closestBlock: { pos: number; rect: DOMRect } | null = null;
  let minDistance = Number.POSITIVE_INFINITY;

  view.state.doc.forEach((_node, offset) => {
    const dom = view.nodeDOM(offset);
    if (dom instanceof HTMLElement) {
      const rect = dom.getBoundingClientRect();
      const blockCenterY = rect.top + rect.height / 2;
      const distance = Math.abs(dropY - blockCenterY);
      if (distance < minDistance) {
        minDistance = distance;
        closestBlock = { pos: offset, rect };
      }
    }
  });

  if (!closestBlock) {
    return null;
  }

  // No explicit any needed here, suppression was invalid or unnecessary
  const nonNullBlock = closestBlock as { pos: number; rect: DOMRect };
  const isAbove = dropY < nonNullBlock.rect.top + nonNullBlock.rect.height / 2;
  return { ...nonNullBlock, isAbove };
}

// Helper to get drop pos from a resolved position
function getPosFromResolved(view: EditorView, resolved: ResolvedPos, dropY: number): number | null {
  if (resolved.depth < 1) {
    return null;
  }
  const blockPos = resolved.start(1);
  const dom = view.nodeDOM(blockPos);
  const domElement = dom instanceof HTMLElement ? dom : (dom as globalThis.Node)?.parentElement;

  if (!(domElement instanceof HTMLElement)) {
    return blockPos;
  }

  const rect = domElement.getBoundingClientRect();
  const isAbove = dropY < rect.top + rect.height / 2;
  const posBeforeBlock = resolved.before(1);
  const blockNode = view.state.doc.nodeAt(posBeforeBlock);

  if (!blockNode) {
    return blockPos;
  }

  const posAfterBlock = posBeforeBlock + blockNode.nodeSize;
  return isAbove ? posBeforeBlock : posAfterBlock;
}

// Compute drop target position from screen coordinates
function computeDropTargetPos(view: EditorView, dropX: number, dropY: number): number | null {
  const coords = { left: dropX, top: dropY };
  const posInfo = view.posAtCoords(coords);

  // If inside editor, use resolved position WITH isAbove consideration
  if (posInfo) {
    try {
      const resolved = view.state.doc.resolve(posInfo.pos);
      const pos = getPosFromResolved(view, resolved, dropY);
      if (pos !== null) {
        return pos;
      }
    } catch {
      // Fall through to closest block logic
    }
  }

  // Fallback: find closest block by Y position
  const closest = findClosestBlockByY(view, dropY);
  if (!closest) {
    return null;
  }

  const closestNode = view.state.doc.nodeAt(closest.pos);
  if (!closestNode) {
    return null;
  }

  return closest.isAbove ? closest.pos : closest.pos + closestNode.nodeSize;
}

type DropIndicator = {
  y: number;
  x: number;
  width: number;
};

type DragCoords = {
  x: number;
  y: number;
};

// Compute the normalized Y position for drop indicator to avoid double indicators
function computeNormalizedIndicatorY(
  view: EditorView,
  blockPos: number,
  rect: DOMRect,
  isAbove: boolean
): number {
  if (!isAbove) {
    return rect.bottom;
  }

  try {
    // blockPos is now the position before the block (from resolved.before(1))
    // We need to find the previous block's bottom edge for consistency
    if (blockPos > 0) {
      // Find the previous sibling block by iterating through doc children
      let prevBlockEnd = 0;
      let foundPrev = false;
      view.state.doc.forEach((node, offset) => {
        if (offset + node.nodeSize <= blockPos) {
          prevBlockEnd = offset;
          foundPrev = true;
        }
      });

      if (foundPrev) {
        const prevDom = view.nodeDOM(prevBlockEnd);
        if (prevDom instanceof HTMLElement) {
          return prevDom.getBoundingClientRect().bottom;
        }
      }
    }
  } catch {
    // Fall through to use rect.top
  }

  return rect.top;
}

// Compute drop indicator from cursor position inside editor
function computeDropIndicatorFromPos(
  view: EditorView,
  posInfo: { pos: number; inside: number },
  dropY: number
): DropIndicator | null {
  try {
    const resolved = view.state.doc.resolve(posInfo.pos);
    if (resolved.depth < 1) {
      return null;
    }

    // Use before(1) to get the position of the block node itself, not its content
    const blockPos = resolved.before(1);
    const dom = view.nodeDOM(blockPos);
    if (!(dom instanceof HTMLElement)) {
      return null;
    }

    const rect = dom.getBoundingClientRect();
    const isAbove = dropY < rect.top + rect.height / 2;
    const indicatorY = computeNormalizedIndicatorY(view, blockPos, rect, isAbove);

    return { y: indicatorY, x: rect.left, width: rect.width };
  } catch {
    return null;
  }
}

function computeIndicatorFromCoords(
  view: EditorView,
  dropX: number,
  dropY: number
): DropIndicator | null {
  const posInfo = view.posAtCoords({ left: dropX, top: dropY });

  if (!posInfo) {
    const closest = findClosestBlockByY(view, dropY);
    if (!closest) {
      return null;
    }
    const indicatorY = computeNormalizedIndicatorY(
      view,
      closest.pos,
      closest.rect,
      closest.isAbove
    );
    return { y: indicatorY, x: closest.rect.left, width: closest.rect.width };
  }

  return computeDropIndicatorFromPos(view, posInfo, dropY);
}

function isSameIndicator(a: DropIndicator | null, b: DropIndicator | null): boolean {
  if (!a || !b) {
    return a === b;
  }
  return a.x === b.x && a.y === b.y && a.width === b.width;
}

function performMoveTransaction(
  view: EditorView,
  srcPos: number,
  srcNode: PMNode,
  targetPos: number
) {
  const srcEnd = srcPos + srcNode.nodeSize;

  // Don't move if dropped in the same position
  if (targetPos >= srcPos && targetPos <= srcEnd) {
    return;
  }

  const tr = view.state.tr;

  if (targetPos < srcPos) {
    // Moving UP: First delete the source, then insert at original target position
    // Since targetPos is before srcPos, deleting srcPos->srcEnd doesn't affect targetPos
    tr.delete(srcPos, srcEnd);
    // targetPos is unchanged because the deletion was after it
    tr.insert(targetPos, srcNode);
  } else {
    // Moving DOWN: delete first, then insert at mapped position
    tr.delete(srcPos, srcEnd);
    const mappedInsertPos = tr.mapping.map(targetPos);
    tr.insert(mappedInsertPos, srcNode);
  }

  view.dispatch(tr);
  view.focus();

  // Force annotation decoration rebuild after block reorder
  // The document structure changed, so annotations need to re-resolve their positions
  // Mark with BRIDGE_ORIGIN_META to skip Loro sync (UI-only update)
  setTimeout(() => {
    if (!view.isDestroyed) {
      view.dispatch(
        view.state.tr.setMeta("addToHistory", false).setMeta(BRIDGE_ORIGIN_META, "loro")
      );
    }
  }, 0);
}

export function LfccDragLayer({ children }: { children: React.ReactNode }) {
  const context = useLfccEditorContext();
  const [activeId, setActiveId] = React.useState<string | null>(null);
  const [activeBlockPreview, setActiveBlockPreview] = React.useState<string | null>(null);
  const [dropIndicator, setDropIndicator] = React.useState<DropIndicator | null>(null);
  const dragStartPosRef = React.useRef<{ x: number; y: number } | null>(null);
  const dragMoveFrameRef = React.useRef<number | null>(null);
  const pendingDragMoveRef = React.useRef<DragCoords | null>(null);
  const lastIndicatorRef = React.useRef<DropIndicator | null>(null);

  const sensors = useSensors(
    useSensor(CustomPointerSensor, {
      activationConstraint: {
        distance: 5, // Standard distance is fine now that we have strict target filtering
      },
    })
  );

  const clearDragVisuals = () => {
    if (dragMoveFrameRef.current !== null) {
      window.cancelAnimationFrame(dragMoveFrameRef.current);
      dragMoveFrameRef.current = null;
    }
    pendingDragMoveRef.current = null;
    lastIndicatorRef.current = null;
    setDropIndicator(null);
    setActiveId(null);
    setActiveBlockPreview(null);
    dragStartPosRef.current = null;
  };

  const updateIndicator = (indicator: DropIndicator | null) => {
    if (isSameIndicator(lastIndicatorRef.current, indicator)) {
      return;
    }
    lastIndicatorRef.current = indicator;
    setDropIndicator(indicator);
  };

  const scheduleIndicatorUpdate = (view: EditorView, coords: DragCoords) => {
    pendingDragMoveRef.current = coords;
    if (dragMoveFrameRef.current !== null) {
      return;
    }

    dragMoveFrameRef.current = window.requestAnimationFrame(() => {
      dragMoveFrameRef.current = null;
      const latest = pendingDragMoveRef.current;
      pendingDragMoveRef.current = null;
      if (!latest || view.isDestroyed) {
        return;
      }
      const indicator = computeIndicatorFromCoords(view, latest.x, latest.y);
      updateIndicator(indicator);
    });
  };

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
    lastIndicatorRef.current = null;
    // Store initial position for drop calculation
    const activatorEvent = event.activatorEvent as PointerEvent;
    dragStartPosRef.current = { x: activatorEvent.clientX, y: activatorEvent.clientY };

    // Get block preview text
    const view = context?.view;
    if (view) {
      const activeIdStr = event.active.id as string;
      if (activeIdStr.startsWith("block:")) {
        const blockId = activeIdStr.slice(6);
        const srcBlock = findBlockById(view, blockId);
        if (srcBlock) {
          setActiveBlockPreview(getBlockPreview(srcBlock.node));
        }
      }
    }
  };

  const handleDragMove = (event: DragMoveEvent) => {
    const view = context?.view;
    if (!view || !dragStartPosRef.current) {
      updateIndicator(null);
      return;
    }

    const delta = event.delta;
    scheduleIndicatorUpdate(view, {
      x: dragStartPosRef.current.x + delta.x,
      y: dragStartPosRef.current.y + delta.y,
    });
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const view = context?.view;
    if (!view) {
      clearDragVisuals();
      return;
    }

    // Extract blockId from the draggable id (format: "block:{blockId}")
    const activeIdStr = event.active.id as string;
    if (!activeIdStr.startsWith("block:")) {
      clearDragVisuals();
      return;
    }
    const blockId = activeIdStr.slice(6); // Remove "block:" prefix

    // Get the final pointer position from the event
    const delta = event.delta;
    if (!dragStartPosRef.current) {
      clearDragVisuals();
      return;
    }

    const dropX = dragStartPosRef.current.x + delta.x;
    const dropY = dragStartPosRef.current.y + delta.y;

    // Find the source block
    const srcBlock = findBlockById(view, blockId);
    if (!srcBlock) {
      clearDragVisuals();
      return;
    }

    // Determine drop position
    const targetPos = computeDropTargetPos(view, dropX, dropY);
    if (targetPos === null) {
      clearDragVisuals();
      return;
    }

    performMoveTransaction(view, srcBlock.pos, srcBlock.node, targetPos);
    clearDragVisuals();
  };

  const handleDragCancel = () => {
    clearDragVisuals();
  };

  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  // Always pass all handlers consistently to avoid hook array size mismatch
  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragMove={handleDragMove}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      {children}
      {/* Annotation drag preview - external overlay to avoid text jank */}
      <AnnotationDragOverlay editorView={context?.view ?? null} />
      {mounted &&
        createPortal(
          <>
            {/* Drop indicator - subtle style */}
            {dropIndicator && (
              <>
                {/* The main line - Vivid Blue with Glow */}
                <div
                  className="pointer-events-none z-9999"
                  style={{
                    position: "fixed",
                    left: dropIndicator.x,
                    top: dropIndicator.y - 1,
                    width: dropIndicator.width,
                    height: 2,
                    background: "#3b82f6", // Vivid blue (Linear-like)
                    boxShadow: "0 0 4px #3b82f6", // Glow effect
                    borderRadius: 1,
                  }}
                />
                {/* Left anchor dot - Matching Blue */}
                <div
                  className="pointer-events-none z-9999"
                  style={{
                    position: "fixed",
                    left: dropIndicator.x - 5, // Slightly larger offset
                    top: dropIndicator.y - 3.5,
                    width: 7, // Slightly larger dot
                    height: 7,
                    background: "#3b82f6",
                    boxShadow: "0 0 4px #3b82f6",
                    border: "1px solid white", // crisp edge
                    borderRadius: "50%",
                  }}
                />
              </>
            )}

            <DragOverlay dropAnimation={null} zIndex={9999}>
              {activeId ? (
                <div
                  className="flex items-center gap-2 pl-0 pr-4 py-1"
                  style={{
                    // Ghost block style: looks like the content itself but transparent
                    opacity: 0.8,
                    background: "var(--color-card, #ffffff)", // Use correct theme variable
                    // No border, no heavy shadow - just a "ghost"
                    maxWidth: "600px", // Allow wider preview
                    minWidth: "200px", // Ensure card has substance
                    borderRadius: "4px", // Subtle rounding matching block selection
                  }}
                >
                  {/* Grip Handle Icon - Visible effectively as part of the ghost */}
                  <div className="shrink-0 flex items-center justify-center w-6 h-6 text-muted-foreground">
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <title>Drag handle</title>
                      <circle cx="9" cy="12" r="1" />
                      <circle cx="9" cy="5" r="1" />
                      <circle cx="9" cy="19" r="1" />
                      <circle cx="15" cy="12" r="1" />
                      <circle cx="15" cy="5" r="1" />
                      <circle cx="15" cy="19" r="1" />
                    </svg>
                  </div>

                  {/* Content Preview */}
                  <div
                    style={{
                      flex: 1,
                      minWidth: 0,
                      fontWeight: 400, // Regular weight like editor text
                      fontSize: "var(--reader-font-size, 16px)", // Match editor font
                      lineHeight: "var(--reader-line-height, 1.5)",
                      color: "var(--color-foreground, #0f172a)", // Use correct theme variable
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {activeBlockPreview || "Moving block..."}
                  </div>
                </div>
              ) : null}
            </DragOverlay>
          </>,
          document.body
        )}
    </DndContext>
  );
}
