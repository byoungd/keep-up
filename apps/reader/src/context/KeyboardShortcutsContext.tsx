"use client";

import * as React from "react";
import { useCallback, useEffect, useMemo, useState } from "react";

export type ShortcutAction = {
  id: string;
  label: string;
  keys: string[]; // e.g., ["Cmd", "K"]
  action: () => void;
  description?: string;
  section?: string; // For grouping in Command Palette
  disabled?: boolean;
};

interface KeyboardShortcutsContextType {
  shortcuts: ShortcutAction[];
  registerShortcut: (shortcut: ShortcutAction) => void;
  unregisterShortcut: (id: string) => void;
}

const KeyboardShortcutsContext = React.createContext<KeyboardShortcutsContextType | undefined>(
  undefined
);

export function KeyboardShortcutsProvider({ children }: { children: React.ReactNode }) {
  const [shortcuts, setShortcuts] = useState<ShortcutAction[]>([]);

  const registerShortcut = useCallback((shortcut: ShortcutAction) => {
    setShortcuts((prev) => {
      if (prev.some((s) => s.id === shortcut.id)) {
        return prev;
      }
      return [...prev, shortcut];
    });
  }, []);

  const unregisterShortcut = useCallback((id: string) => {
    setShortcuts((prev) => prev.filter((s) => s.id !== id));
  }, []);

  // Global keydown listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if input/textarea is focused (unless it's a special global shortcut like Cmd+K)
      // For simplicity, we'll let individual actions decide if they should prevent default
      const tag = (e.target as HTMLElement).tagName;
      const isInput =
        tag === "INPUT" || tag === "TEXTAREA" || (e.target as HTMLElement).isContentEditable;

      const matchingShortcut = findMatchingShortcut(shortcuts, e);

      if (matchingShortcut) {
        // If it's an input and the shortcut is single letter, ignore
        if (
          isInput &&
          matchingShortcut.keys.length === 1 &&
          !e.metaKey &&
          !e.ctrlKey &&
          !e.altKey
        ) {
          return;
        }

        e.preventDefault();
        matchingShortcut.action();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [shortcuts]);

  const value = useMemo(
    () => ({
      shortcuts,
      registerShortcut,
      unregisterShortcut,
    }),
    [shortcuts, registerShortcut, unregisterShortcut]
  );

  return (
    <KeyboardShortcutsContext.Provider value={value}>{children}</KeyboardShortcutsContext.Provider>
  );
}

export function useKeyboardShortcuts() {
  const context = React.useContext(KeyboardShortcutsContext);
  if (context === undefined) {
    throw new Error("useKeyboardShortcuts must be used within a KeyboardShortcutsProvider");
  }
  return context;
}

function findMatchingShortcut(
  shortcuts: ShortcutAction[],
  e: KeyboardEvent
): ShortcutAction | undefined {
  return shortcuts.find((shortcut) => {
    if (shortcut.disabled) {
      return false;
    }

    // Very basic matching for now - can be expanded for complex combos
    const keys = shortcut.keys.map((k) => k.toLowerCase());
    const pressed: string[] = [];

    if (e.metaKey || e.ctrlKey) {
      pressed.push("cmd"); // Treat Ctrl/Cmd as same for now
    }
    if (e.shiftKey) {
      pressed.push("shift");
    }
    if (e.altKey) {
      pressed.push("alt");
    }

    // Handle regular keys
    if (e.key !== "Meta" && e.key !== "Control" && e.key !== "Shift" && e.key !== "Alt") {
      pressed.push(e.key.toLowerCase());
    }

    // Exact match check
    if (keys.length !== pressed.length) {
      return false;
    }
    return keys.every((k) => pressed.includes(k));
  });
}
