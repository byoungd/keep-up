import { Plugin, PluginKey } from "prosemirror-state";

/**
 * Plugin to add visual feedback animation when blocks are moved.
 * Listens for transactions with "movedBlockId" metadata and adds
 * a CSS class to trigger the block-just-moved animation.
 */
export const blockMoveAnimationPluginKey = new PluginKey("blockMoveAnimation");

export function createBlockMoveAnimationPlugin(): Plugin {
  return new Plugin({
    key: blockMoveAnimationPluginKey,
    appendTransaction(transactions, _oldState, _newState) {
      // Check if any transaction has the movedBlockId meta
      for (const tr of transactions) {
        const movedBlockId = tr.getMeta("movedBlockId") as string | undefined;
        if (movedBlockId) {
          // Apply the animation class via DOM manipulation after render
          // We use setTimeout to ensure the DOM has updated
          setTimeout(() => {
            const blockEl = document.querySelector(`[data-block-id="${movedBlockId}"]`);
            if (blockEl) {
              // Remove any existing animation
              blockEl.classList.remove("block-just-moved");
              // Force reflow to restart animation
              void (blockEl as HTMLElement).offsetWidth;
              // Add animation class
              blockEl.classList.add("block-just-moved");
              // Remove class after animation completes
              setTimeout(() => {
                blockEl.classList.remove("block-just-moved");
              }, 500);

              // Ensure block is visible after move (smooth scroll)
              blockEl.scrollIntoView({
                behavior: "auto", // Force auto to fix E2E regression
                block: "nearest",
              });
            }
          }, 0);
        }
      }
      // Don't need to create a new transaction
      return null;
    },
  });
}
