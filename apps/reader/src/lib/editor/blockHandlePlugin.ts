import { getHandleTargetFromCoords } from "@/lib/blocks/blockTargeting";
import { LFCC_STRUCTURAL_META } from "@ku0/lfcc-bridge";
import type { Node } from "prosemirror-model";
import { Plugin, PluginKey } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";

export interface BlockHandleState {
  active: boolean;
  pos: number | null;
  blockId: string | null;
  domRect: DOMRect | null;
}

export const blockHandleKey = new PluginKey<BlockHandleState>("blockHandle");

// Helper to find block by ID in document
function findBlockById(view: EditorView, id: string): { pos: number; node: Node } | null {
  let found: { pos: number; node: Node } | null = null;
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

export type BlockHandlePluginOptions = {
  onStateChange?: (state: BlockHandleState) => void;
};

// Note: findBlockAtPos replaced by getHandleTargetFromCoords for container-aware targeting

export function createBlockHandlePlugin({ onStateChange }: BlockHandlePluginOptions = {}) {
  return new Plugin<BlockHandleState>({
    key: blockHandleKey,
    state: {
      init() {
        return { active: false, pos: null, blockId: null, domRect: null };
      },
      apply(tr, value) {
        const meta = tr.getMeta(blockHandleKey);
        if (meta) {
          return meta;
        }

        // If doc changed and we are active, map the position
        if (value.active && value.pos !== null) {
          const result = tr.mapping.mapResult(value.pos);
          if (result.deleted) {
            return { active: false, pos: null, blockId: null, domRect: null };
          }
          return { ...value, pos: result.pos };
        }

        return value;
      },
    },
    props: {
      handleDOMEvents: {
        // Using mouseover to detect when hovering different elements
        // Uses container-first targeting policy for consistent behavior
        mouseover(view, event) {
          const coords = { left: event.clientX, top: event.clientY };

          // Use container-first targeting for stable handle behavior
          const target = getHandleTargetFromCoords(view, coords, "container-first");

          if (target) {
            const current = blockHandleKey.getState(view.state);
            // Update if target block changed
            if (current?.blockId !== target.blockId) {
              const rect = target.dom.getBoundingClientRect();
              const tr = view.state.tr.setMeta(blockHandleKey, {
                active: true,
                pos: target.blockPos,
                blockId: target.blockId,
                domRect: rect,
              });
              tr.setMeta("addToHistory", false);
              view.dispatch(tr);
            }
          } else {
            // No target found (e.g. empty space below content)
            // But we must be careful not to flicker if moving briefly between blocks?
            // For now, let's clear it to avoid sticky handles on far-away hover.
            // Check if we are hovering the toolbar itself? (Not possible via editor mouseover usually)

            const current = blockHandleKey.getState(view.state);
            if (current?.active) {
              // Only clear if we are really far away?
              // With gutter logic in getHandleTargetFromCoords, "null" means really null.
              const tr = view.state.tr.setMeta(blockHandleKey, {
                active: false,
                pos: null,
                blockId: null,
                domRect: null,
              });
              tr.setMeta("addToHistory", false);
              view.dispatch(tr);
            }
          }
          return false;
        },
        // Hide handle if mouse leaves editor, UNLESS entering the toolbar
        mouseleave(view, event) {
          const related = event.relatedTarget as Element | null;
          // If we moved to the block handle portal, keep active
          if (related?.closest?.("[data-lfcc-block-handle-root]")) {
            return false;
          }

          const current = blockHandleKey.getState(view.state);
          if (!current?.active) {
            return false;
          }

          // Otherwise, clear state
          const tr = view.state.tr.setMeta(blockHandleKey, {
            active: false,
            pos: null,
            blockId: null,
            domRect: null,
          });
          tr.setMeta("addToHistory", false);
          view.dispatch(tr);
          return false;
        },
      },
      handleDrop(view, event, _slice, _moved) {
        const blockId = event.dataTransfer?.getData("application/lfcc-block-id");
        if (!blockId) {
          return false;
        }

        event.preventDefault();

        // 1. Find the Source Block by ID
        const srcBlock = findBlockById(view, blockId);
        if (!srcBlock) {
          return false;
        }

        // 2. Determine Drop Position
        const coords = { left: event.clientX, top: event.clientY };
        const posInfo = view.posAtCoords(coords);
        if (!posInfo) {
          return false;
        }

        const targetPos = posInfo.pos;

        // 3. Execute Atomic Move
        const srcPos = srcBlock.pos;
        const srcNode = srcBlock.node;
        if (!srcNode) {
          return false;
        }
        const srcEnd = srcPos + srcNode.nodeSize;

        const tr = view.state.tr;
        tr.delete(srcPos, srcEnd);

        // Use mapping to find new insert pos
        const mappedInsertPos = tr.mapping.map(targetPos);

        tr.insert(mappedInsertPos, srcNode); // Re-insert same node (same ID attributes)
        tr.setMeta(LFCC_STRUCTURAL_META, true);
        tr.setMeta("movedBlockId", srcNode.attrs.block_id);

        view.dispatch(tr);
        view.focus();
        return true;
      },
    },
    view(_editorView) {
      return {
        update(view, prevState) {
          const state = blockHandleKey.getState(view.state);
          // Notify if state object changed
          if (state && state !== blockHandleKey.getState(prevState)) {
            onStateChange?.(state);
          }
        },
      };
    },
  });
}
