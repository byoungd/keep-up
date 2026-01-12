"use client";

import { useKeyboardShortcuts } from "@/context/KeyboardShortcutsContext";
import { useCallback, useEffect } from "react";
import { create } from "zustand";

/**
 * Focus mode store - global state for focus mode
 */
interface FocusModeState {
  isActive: boolean;
  setActive: (active: boolean) => void;
  toggle: () => void;
}

export const useFocusModeStore = create<FocusModeState>((set) => ({
  isActive: false,
  setActive: (active) => set({ isActive: active }),
  toggle: () => set((state) => ({ isActive: !state.isActive })),
}));

/**
 * Hook to manage focus mode.
 *
 * Registers Cmd+Shift+F to toggle focus mode.
 * Escape exits focus mode when active.
 */
export function useFocusMode() {
  const { registerShortcut, unregisterShortcut } = useKeyboardShortcuts();
  const { isActive, toggle, setActive } = useFocusModeStore();

  // Apply focus mode attribute to document body
  useEffect(() => {
    if (isActive) {
      document.body.setAttribute("data-focus-mode", "true");
    } else {
      document.body.removeAttribute("data-focus-mode");
    }

    return () => {
      document.body.removeAttribute("data-focus-mode");
    };
  }, [isActive]);

  // Register keyboard shortcuts
  useEffect(() => {
    // Register Cmd+Shift+F to toggle focus mode
    registerShortcut({
      id: "toggle-focus-mode",
      label: "Toggle Focus Mode",
      keys: ["cmd", "shift", "f"],
      description: "Enter distraction-free writing mode",
      section: "Appearance",
      action: toggle,
    });

    // Register Escape to exit focus mode (only when active)
    registerShortcut({
      id: "exit-focus-mode",
      label: "Exit Focus Mode",
      keys: ["escape"],
      description: "Exit focus mode and return to normal view",
      section: "Navigation",
      disabled: !isActive,
      action: () => {
        if (isActive) {
          setActive(false);
        }
      },
    });

    return () => {
      unregisterShortcut("toggle-focus-mode");
      unregisterShortcut("exit-focus-mode");
    };
  }, [registerShortcut, unregisterShortcut, toggle, isActive, setActive]);

  return {
    isActive,
    toggle,
    enter: useCallback(() => setActive(true), [setActive]),
    exit: useCallback(() => setActive(false), [setActive]),
  };
}
