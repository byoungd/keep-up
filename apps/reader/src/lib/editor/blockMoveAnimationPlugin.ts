import { Plugin, PluginKey } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";

/**
 * Plugin to add visual feedback animation when blocks are moved.
 * Listens for transactions with "movedBlockId" metadata and adds
 * a CSS class to trigger the block-just-moved animation.
 */
export const blockMoveAnimationPluginKey = new PluginKey("blockMoveAnimation");

export function createBlockMoveAnimationPlugin(): Plugin {
  let view: EditorView | null = null;
  let pendingFrame: number | null = null;
  let pendingBlockId: string | null = null;
  const removalTimers = new Map<string, ReturnType<typeof setTimeout>>();

  const clearRemovalTimer = (blockId: string) => {
    const timer = removalTimers.get(blockId);
    if (timer) {
      clearTimeout(timer);
      removalTimers.delete(blockId);
    }
  };

  const clearAllTimers = () => {
    if (pendingFrame !== null && typeof window !== "undefined") {
      window.cancelAnimationFrame(pendingFrame);
      pendingFrame = null;
    }
    for (const timer of removalTimers.values()) {
      clearTimeout(timer);
    }
    removalTimers.clear();
    pendingBlockId = null;
  };

  const runAnimation = () => {
    pendingFrame = null;
    if (!view || view.isDestroyed || !pendingBlockId) {
      pendingBlockId = null;
      return;
    }

    const blockId = pendingBlockId;
    pendingBlockId = null;
    const blockEl = view.dom.querySelector(`[data-block-id="${blockId}"]`);
    if (!(blockEl instanceof HTMLElement)) {
      return;
    }

    // Remove any existing animation
    blockEl.classList.remove("block-just-moved");
    // Force reflow to restart animation
    void blockEl.offsetWidth;
    // Add animation class
    blockEl.classList.add("block-just-moved");

    clearRemovalTimer(blockId);
    removalTimers.set(
      blockId,
      setTimeout(() => {
        if (!view || view.isDestroyed) {
          return;
        }
        blockEl.classList.remove("block-just-moved");
        removalTimers.delete(blockId);
      }, 500)
    );

    // Ensure block is visible after move (smooth scroll)
    blockEl.scrollIntoView({
      behavior: "auto", // Force auto to fix E2E regression
      block: "nearest",
    });
  };

  const scheduleAnimation = (blockId: string) => {
    if (typeof window === "undefined") {
      return;
    }
    pendingBlockId = blockId;
    if (pendingFrame !== null) {
      return;
    }
    pendingFrame = window.requestAnimationFrame(runAnimation);
  };

  return new Plugin({
    key: blockMoveAnimationPluginKey,
    appendTransaction(transactions, _oldState, _newState) {
      // Check if any transaction has the movedBlockId meta
      let movedBlockId: string | null = null;
      for (const tr of transactions) {
        const candidate = tr.getMeta("movedBlockId") as string | undefined;
        if (candidate) {
          movedBlockId = candidate;
        }
      }
      if (movedBlockId) {
        scheduleAnimation(movedBlockId);
      }
      // Don't need to create a new transaction
      return null;
    },
    view(editorView) {
      view = editorView;
      return {
        destroy() {
          clearAllTimers();
          view = null;
        },
      };
    },
  });
}
