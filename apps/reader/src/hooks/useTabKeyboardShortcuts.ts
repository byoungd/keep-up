"use client";

import { useTabContext } from "@/context/TabContext";
import * as React from "react";

/**
 * Keyboard shortcuts for tab navigation:
 * - Cmd/Ctrl + T: New tab
 * - Cmd/Ctrl + W: Close current tab
 * - Cmd/Ctrl + Tab: Next tab
 * - Cmd/Ctrl + Shift + Tab: Previous tab
 * - Cmd/Ctrl + 1-9: Switch to tab by index
 * - Cmd/Ctrl + \: Toggle split view (if 2+ tabs)
 * - Cmd/Ctrl + [: Focus left pane
 * - Cmd/Ctrl + ]: Focus right pane
 */
export function useTabKeyboardShortcuts() {
  const {
    state,
    openTab,
    closeTab,
    activateTab,
    splitWithTab,
    closePane,
    setActivePane,
    isSplitView,
  } = useTabContext();

  React.useEffect(() => {
    // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Complex keyboard handler with many shortcuts is expected
    const handleKeyDown = (e: KeyboardEvent) => {
      const isMeta = e.metaKey || e.ctrlKey;
      if (!isMeta) {
        return;
      }

      const activePaneIndex = state.activePaneIndex;
      const activePane = state.panes[activePaneIndex];
      const tabs = activePane?.tabs ?? [];
      const activeTabId = activePane?.activeTabId;

      // Cmd/Ctrl + T: New tab
      if (e.key === "t" && !e.shiftKey) {
        e.preventDefault();
        openTab(`new-${Date.now()}`, "New Tab", activePaneIndex);
        return;
      }

      // Cmd/Ctrl + W: Close current tab
      if (e.key === "w" && !e.shiftKey) {
        e.preventDefault();
        if (activeTabId) {
          closeTab(activeTabId, activePaneIndex);
        }
        return;
      }

      // Cmd/Ctrl + Tab / Cmd/Ctrl + Shift + Tab: Cycle tabs
      if (e.key === "Tab") {
        e.preventDefault();
        if (tabs.length <= 1) {
          return;
        }

        const currentIndex = tabs.findIndex((t) => t.id === activeTabId);
        let nextIndex: number;

        if (e.shiftKey) {
          // Previous tab
          nextIndex = currentIndex <= 0 ? tabs.length - 1 : currentIndex - 1;
        } else {
          // Next tab
          nextIndex = currentIndex >= tabs.length - 1 ? 0 : currentIndex + 1;
        }

        activateTab(tabs[nextIndex].id, activePaneIndex);
        return;
      }

      // Cmd/Ctrl + 1-9: Switch to tab by index
      if (e.key >= "1" && e.key <= "9") {
        e.preventDefault();
        const index = Number.parseInt(e.key, 10) - 1;

        if (e.key === "9") {
          // Cmd+9 always goes to last tab (Chrome behavior)
          if (tabs.length > 0) {
            activateTab(tabs[tabs.length - 1].id, activePaneIndex);
          }
        } else if (index < tabs.length) {
          activateTab(tabs[index].id, activePaneIndex);
        }
        return;
      }

      // Cmd/Ctrl + \: Toggle split view
      if (e.key === "\\") {
        e.preventDefault();
        if (isSplitView) {
          // Close the non-active pane
          closePane(activePaneIndex === 0 ? 1 : 0);
        } else if (tabs.length >= 2) {
          // Split with the active tab
          if (activeTabId) {
            splitWithTab(activeTabId, "horizontal");
          }
        }
        return;
      }

      // Cmd/Ctrl + [: Focus left pane
      if (e.key === "[" && isSplitView) {
        e.preventDefault();
        setActivePane(0);
        return;
      }

      // Cmd/Ctrl + ]: Focus right pane
      if (e.key === "]" && isSplitView) {
        e.preventDefault();
        setActivePane(1);
        return;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [state, openTab, closeTab, activateTab, splitWithTab, closePane, setActivePane, isSplitView]);
}

/**
 * Component that registers tab keyboard shortcuts.
 * Place this inside TabProvider.
 */
export function TabKeyboardShortcuts() {
  useTabKeyboardShortcuts();
  return null;
}
