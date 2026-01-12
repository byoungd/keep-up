"use client";

import { useKeyboardShortcuts } from "@/context/KeyboardShortcutsContext";
import { useTabContext } from "@/context/TabContext";
import { useEffect } from "react";

/**
 * Registers split view commands with the keyboard shortcuts context.
 * These commands appear in the Command Palette and can be triggered via keyboard.
 *
 * Split View Commands:
 * - Toggle Split View (Cmd+\)
 * - Split Editor Right
 * - Split Editor Down
 * - Toggle Split Direction (Cmd+Shift+\)
 * - Reset Split Ratio
 * - Close Split View
 * - Focus Left Pane (Cmd+[)
 * - Focus Right Pane (Cmd+])
 * - Swap Panes
 * - Maximize Current Pane
 */
export function useSplitViewCommands() {
  const {
    state,
    splitWithTab,
    closePane,
    setActivePane,
    swapPanes,
    toggleSplitDirection,
    resetSplitRatio,
    maximizePane,
    isSplitView,
  } = useTabContext();

  const { registerShortcut, unregisterShortcut } = useKeyboardShortcuts();

  useEffect(() => {
    const activePaneIndex = state.activePaneIndex;
    const activePane = state.panes[activePaneIndex];
    const activeTabId = activePane?.activeTabId;
    const hasTabs = (activePane?.tabs.length ?? 0) >= 2;

    const splitViewCommands = [
      {
        id: "split-editor-right",
        label: "Split Editor Right",
        description: "Open current tab in a new pane to the right",
        keys: [] as string[],
        section: "Split View",
        action: () => {
          if (activeTabId && !isSplitView) {
            splitWithTab(activeTabId, "horizontal");
          }
        },
        disabled: !hasTabs || isSplitView,
      },
      {
        id: "split-editor-down",
        label: "Split Editor Down",
        description: "Open current tab in a new pane below",
        keys: [] as string[],
        section: "Split View",
        action: () => {
          if (activeTabId && !isSplitView) {
            splitWithTab(activeTabId, "vertical");
          }
        },
        disabled: !hasTabs || isSplitView,
      },
      {
        id: "toggle-split-direction",
        label: "Toggle Split Direction",
        description: "Switch between horizontal and vertical split",
        keys: ["Cmd", "Shift", "\\"],
        section: "Split View",
        action: () => {
          if (isSplitView) {
            toggleSplitDirection();
          }
        },
        disabled: !isSplitView,
      },
      {
        id: "reset-split-ratio",
        label: "Reset Split Size",
        description: "Reset panes to equal 50/50 size",
        keys: [] as string[],
        section: "Split View",
        action: () => {
          if (isSplitView) {
            resetSplitRatio();
          }
        },
        disabled: !isSplitView,
      },
      {
        id: "close-split-view",
        label: "Close Split View",
        description: "Merge all tabs into a single pane",
        keys: [] as string[],
        section: "Split View",
        action: () => {
          if (isSplitView) {
            closePane(activePaneIndex === 0 ? 1 : 0);
          }
        },
        disabled: !isSplitView,
      },
      {
        id: "focus-left-pane",
        label: "Focus Left Pane",
        description: "Switch focus to the left pane",
        keys: ["Cmd", "["],
        section: "Split View",
        action: () => {
          if (isSplitView) {
            setActivePane(0);
          }
        },
        disabled: !isSplitView,
      },
      {
        id: "focus-right-pane",
        label: "Focus Right Pane",
        description: "Switch focus to the right pane",
        keys: ["Cmd", "]"],
        section: "Split View",
        action: () => {
          if (isSplitView) {
            setActivePane(1);
          }
        },
        disabled: !isSplitView,
      },
      {
        id: "swap-panes",
        label: "Swap Panes",
        description: "Swap the position of left and right panes",
        keys: [] as string[],
        section: "Split View",
        action: () => {
          if (isSplitView) {
            swapPanes();
          }
        },
        disabled: !isSplitView,
      },
      {
        id: "maximize-current-pane",
        label: "Maximize Current Pane",
        description: "Expand the active pane to maximum size",
        keys: [] as string[],
        section: "Split View",
        action: () => {
          if (isSplitView) {
            maximizePane(activePaneIndex);
          }
        },
        disabled: !isSplitView,
      },
    ];

    for (const cmd of splitViewCommands) {
      registerShortcut(cmd);
    }

    return () => {
      for (const cmd of splitViewCommands) {
        unregisterShortcut(cmd.id);
      }
    };
  }, [
    state,
    splitWithTab,
    closePane,
    setActivePane,
    swapPanes,
    toggleSplitDirection,
    resetSplitRatio,
    maximizePane,
    isSplitView,
    registerShortcut,
    unregisterShortcut,
  ]);
}

/**
 * Component that registers split view commands.
 * Place this inside both TabProvider and KeyboardShortcutsProvider.
 */
export function SplitViewCommands() {
  useSplitViewCommands();
  return null;
}
