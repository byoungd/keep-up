"use client";

import type { BlockHandleState } from "@/lib/editor/blockHandlePlugin";
import { useDraggable } from "@dnd-kit/core";
import { AnimatePresence, motion } from "framer-motion";
import { NodeSelection, TextSelection } from "prosemirror-state";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useLfccEditorContext } from "../lfcc/LfccEditorContext";
import { BlockContextMenu, type BlockContextMenuAction } from "./BlockContextMenu";
import { BlockHoverGutter } from "./BlockHoverGutter";

const HOVER_DELAY_MS = 150;

type Props = {
  state: BlockHandleState | null;
};

type MenuState = {
  open: boolean;
  x: number;
  y: number;
  blockId: string | null;
  pos: number | null;
};

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: block handle interactions combine drag, hover, and menu logic in one flow
export function BlockHandlePortal({ state }: Props) {
  const context = useLfccEditorContext();
  const view = context?.view;
  const [rect, setRect] = useState<DOMRect | null>(null);

  // Buffer state to prevent flickering and creating a "hover tunnel"
  // We active hold the state for a few ms if it goes null
  const [delayedState, setDelayedState] = useState<BlockHandleState | null>(state);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    // If we have an active state, update immediately and clear any hide timer
    if (state?.active) {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      setDelayedState(state);
    } else {
      // If state went inactive, wait a bit before hiding
      // This allows moving mouse from block to handle without it disappearing?
      // Actually, the plugin usually keeps it active if hovering handle?
      // If the plugin handles that, we just need to smooth out gaps.
      if (!timeoutRef.current) {
        timeoutRef.current = setTimeout(() => {
          setDelayedState(null);
          timeoutRef.current = null;
        }, HOVER_DELAY_MS);
      }
    }
  }, [state]);

  const activeState = state?.active ? state : delayedState;
  const isActive = !!activeState?.active && !!activeState?.pos;

  const [menuState, setMenuState] = useState<MenuState>({
    open: false,
    x: 0,
    y: 0,
    blockId: null,
    pos: null,
  });
  const pointerDownRef = useRef<{ x: number; y: number } | null>(null);
  const lastBlockIdRef = useRef<string | null>(null);
  const lastPosRef = useRef<number | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Always call useDraggable unconditionally
  const {
    attributes,
    listeners,
    setNodeRef,
    transform: _transform,
    isDragging,
  } = useDraggable({
    id: activeState?.blockId ? `block:${activeState.blockId}` : "temp-drag",
    data: {
      blockId: activeState?.blockId,
      originalPos: activeState?.pos,
      type: "block",
    },
    disabled: !activeState?.blockId,
  });

  // Ensure client-side only for portal
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  // Update rect when state changes or on scroll
  useEffect(() => {
    if (!view || !isActive || activeState?.pos === null || activeState?.pos === undefined) {
      setRect(null);
      return;
    }

    const updatePosition = () => {
      try {
        const pos = activeState.pos;
        if (pos === null || pos === undefined) {
          return;
        }
        const dom = view.nodeDOM(pos);
        if (dom instanceof Element) {
          const domRect = dom.getBoundingClientRect();
          setRect(domRect);
        } else {
          setRect(null);
        }
      } catch {
        // block might be gone
        setRect(null);
      }
    };

    updatePosition();

    // Listen to scroll to update position
    window.addEventListener("scroll", updatePosition, { capture: true, passive: true });
    return () => {
      window.removeEventListener("scroll", updatePosition, { capture: true });
    };
  }, [view, isActive, activeState?.pos]);

  useEffect(() => {
    if (activeState?.blockId) {
      lastBlockIdRef.current = activeState.blockId;
    }
    if (activeState?.pos !== null && activeState?.pos !== undefined) {
      lastPosRef.current = activeState.pos;
    }
  }, [activeState?.blockId, activeState?.pos]);

  // Toast timeout
  useEffect(() => {
    if (toastMessage) {
      const timer = setTimeout(() => setToastMessage(null), 2000);
      return () => clearTimeout(timer);
    }
  }, [toastMessage]);

  if (!mounted) {
    return null;
  }

  // Hide when text is selected (selection toolbar takes precedence)
  const hasTextSelection = view && !view.state.selection.empty;

  const canShowHandle = !!view && isActive && !!rect && !hasTextSelection;
  const canShowMenu = !!view && menuState.open && !!menuState.blockId;
  const canShowToast = !!toastMessage;

  if (!canShowHandle && !canShowMenu && !canShowToast) {
    return null;
  }

  // Native handler removed in favor of dnd-kit
  // but we keep click handling logic separately

  const resolveBlockTarget = (): { blockId: string; pos: number } | null => {
    if (!view) {
      return null;
    }
    const blockId = activeState?.blockId ?? lastBlockIdRef.current;
    if (!blockId) {
      return null;
    }
    let pos = activeState?.pos ?? lastPosRef.current;
    if (pos === null || pos === undefined) {
      let foundPos: number | null = null;
      view.state.doc.descendants((node, nodePos) => {
        if (node.isBlock && node.attrs.block_id === blockId) {
          foundPos = nodePos;
          return false;
        }
        return true;
      });
      pos = foundPos ?? null;
    }
    if (pos === null || pos === undefined) {
      return null;
    }
    return { blockId, pos };
  };

  const handleBlockClick = () => {
    const target = resolveBlockTarget();
    if (!target || !view) {
      return;
    }
    const tr = view.state.tr;
    const selection = NodeSelection.create(view.state.doc, target.pos);
    view.dispatch(tr.setSelection(selection));
    view.focus();
  };

  const handleInsertClick = () => {
    if (!view || activeState?.pos === null || activeState?.pos === undefined) {
      return;
    }
    // Insert paragraph after
    const node = view.state.doc.nodeAt(activeState.pos);
    if (node) {
      const endPos = activeState.pos + node.nodeSize;
      const tr = view.state.tr.insert(endPos, view.state.schema.nodes.paragraph.create());
      tr.setSelection(TextSelection.create(tr.doc, endPos + 1));
      view.dispatch(tr);
      view.focus();
    }
  };

  const openMenuAt = (clientX: number, clientY: number) => {
    const target = resolveBlockTarget();
    if (!target) {
      return;
    }
    setMenuState({
      open: true,
      x: clientX,
      y: clientY,
      blockId: target.blockId,
      pos: target.pos,
    });
  };

  const handleMenuClick = (e: React.MouseEvent) => {
    openMenuAt(e.clientX, e.clientY);
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    pointerDownRef.current = { x: e.clientX, y: e.clientY };
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLButtonElement>) => {
    const start = pointerDownRef.current;
    pointerDownRef.current = null;
    if (!start || isDragging) {
      return;
    }
    const deltaX = e.clientX - start.x;
    const deltaY = e.clientY - start.y;
    const distance = Math.hypot(deltaX, deltaY);
    if (distance > 5) {
      return;
    }
    handleBlockClick();
    openMenuAt(e.clientX, e.clientY);
  };

  const handleMenuClose = () => {
    setMenuState({ open: false, x: 0, y: 0, blockId: null, pos: null });
  };

  const handleMenuAction = (action: BlockContextMenuAction) => {
    if (!view || menuState.pos === null || !menuState.blockId) {
      return;
    }
    const node = view.state.doc.nodeAt(menuState.pos);
    if (!node) {
      return;
    }

    const tr = view.state.tr;

    switch (action) {
      case "duplicate": {
        // Insert copy after current block with NEW ID
        const endPos = menuState.pos + node.nodeSize;
        // Generate new ID (simple random string)
        const newId = `b_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`;
        const newAttrs = { ...node.attrs, block_id: newId };

        // Use type.create to reconstruct node with new attrs
        const newNode = node.type.create(newAttrs, node.content, node.marks);

        tr.insert(endPos, newNode);
        view.dispatch(tr);
        break;
      }
      case "delete": {
        // Delete the block
        tr.delete(menuState.pos, menuState.pos + node.nodeSize);
        view.dispatch(tr);
        break;
      }
      case "turnInto": {
        // Open slash menu at block position? Or show sub-menu?
        // For MVP, just focus editor and user can use /
        view.focus();
        break;
      }
      case "copyLink": {
        // Copy block ID to clipboard
        if (menuState.blockId) {
          navigator.clipboard
            .writeText(`${window.location.origin}${window.location.pathname}#${menuState.blockId}`)
            .then(() => setToastMessage("Link copied to clipboard"))
            .catch(() => setToastMessage("Failed to copy link"));
        }
        break;
      }
    }

    view.focus();
  };

  const handleStyle = rect
    ? (() => {
        // Position: left of block, vertically centered with first line
        // Using fixed position since we portal to document.body and rect is viewport-relative
        // Position toolbar in the gutter area (left of block content)
        const toolbarWidth = 54; // 2 buttons (24px) + gap
        const toolbarHeight = 28;
        const toolbarGap = 6; // Gap between toolbar and content (reduced for better UX)

        // Simple approach: position toolbar to the left of the block with a small gap
        // Ensure it doesn't go off-screen (minimum 4px from viewport edge)
        const toolbarLeft = Math.max(4, rect.left - toolbarWidth - toolbarGap);

        // Dynamic vertical alignment:
        // - For single lines: center vertically (rect.height/2)
        // - For multi-lines: clamp to match first line (max 6px offset)
        const topOffset = Math.min((rect.height - toolbarHeight) / 2, 6);

        return {
          position: "fixed",
          top: rect.top + topOffset,
          left: toolbarLeft,
          width: toolbarWidth + toolbarGap, // Extend width to bridge the gap
          height: toolbarHeight, // Fixed height for horizontal layout
          paddingRight: toolbarGap, // Keep content on the left
        } satisfies React.CSSProperties;
      })()
    : null;

  /* mounted check moved up */

  return (
    <>
      {canShowHandle &&
        createPortal(
          <AnimatePresence>
            {rect && handleStyle && (
              <motion.div
                ref={setNodeRef}
                key="block-handle"
                style={{ ...handleStyle, opacity: isDragging ? 0 : 1 }}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: isDragging ? 0 : 1, x: 0 }}
                exit={{ opacity: 0, x: -8 }}
                transition={{ duration: 0.15, ease: "easeOut" }}
                className="z-[9999] pointer-events-auto flex justify-start"
                data-lfcc-block-handle-root="true"
                onMouseEnter={() => {
                  // Keep delayed state active if user hovers the handle itself
                  if (activeState && timeoutRef.current) {
                    clearTimeout(timeoutRef.current);
                    timeoutRef.current = null;
                    setDelayedState(activeState);
                  }
                }}
              >
                <BlockHoverGutter
                  blockId={activeState?.blockId ?? undefined}
                  onBlockClick={handleBlockClick}
                  onDragStart={undefined} // Handled by dnd-kit listeners
                  onInsertClick={handleInsertClick}
                  onMenuClick={handleMenuClick}
                  onHandlePointerDown={handlePointerDown}
                  onHandlePointerUp={handlePointerUp}
                  className="opacity-100"
                  handleProps={{ ...listeners, ...attributes }}
                />
              </motion.div>
            )}
          </AnimatePresence>,
          document.body
        )}
      {canShowToast &&
        createPortal(
          <AnimatePresence>
            {toastMessage && (
              <motion.div
                key="toast"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 10 }}
                className="fixed bottom-6 right-6 z-toast px-4 py-2 bg-foreground text-background rounded-md shadow-lg text-sm font-medium"
              >
                {toastMessage}
              </motion.div>
            )}
          </AnimatePresence>,
          document.body
        )}
      {canShowMenu && menuState.blockId && (
        <BlockContextMenu
          blockId={menuState.blockId}
          position={{ x: menuState.x, y: menuState.y }}
          onAction={handleMenuAction}
          onClose={handleMenuClose}
        />
      )}
    </>
  );
}
