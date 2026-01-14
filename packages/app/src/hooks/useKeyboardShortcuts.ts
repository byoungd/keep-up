"use client";

import { useCallback, useEffect } from "react";

export interface ShortcutConfig {
  key: string;
  ctrl?: boolean;
  meta?: boolean;
  shift?: boolean;
  alt?: boolean;
  action: () => void;
  description?: string;
}

export interface UseKeyboardShortcutsOptions {
  shortcuts: ShortcutConfig[];
  enabled?: boolean;
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  return target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable;
}

function shouldIgnoreEvent(event: KeyboardEvent): boolean {
  if (!isEditableTarget(event.target)) {
    return false;
  }
  return event.key !== "Escape";
}

function normalizeKey(key: string): string {
  return key.toLowerCase();
}

function modifiersMatch(shortcut: ShortcutConfig, event: KeyboardEvent): boolean {
  const ctrlRequired = Boolean(shortcut.ctrl);
  const metaRequired = Boolean(shortcut.meta);
  const shiftRequired = Boolean(shortcut.shift);
  const altRequired = Boolean(shortcut.alt);

  const ctrlOk = ctrlRequired ? event.ctrlKey : !event.ctrlKey || metaRequired;
  const metaOk = metaRequired ? event.metaKey : !event.metaKey || ctrlRequired;
  const shiftOk = shiftRequired ? event.shiftKey : !event.shiftKey;
  const altOk = altRequired ? event.altKey : !event.altKey;

  if (ctrlRequired || metaRequired) {
    return (event.ctrlKey || event.metaKey) && shiftOk && altOk;
  }

  return ctrlOk && metaOk && shiftOk && altOk;
}

function matchesShortcut(event: KeyboardEvent, shortcut: ShortcutConfig): boolean {
  if (normalizeKey(event.key) !== normalizeKey(shortcut.key)) {
    return false;
  }
  return modifiersMatch(shortcut, event);
}

/**
 * Centralized keyboard shortcut handler.
 * Handles common shortcuts for the editor:
 * - Cmd/Ctrl+K: Toggle Slash Menu
 * - Cmd/Ctrl+Shift+A: Create annotation from selection
 * - Escape: Clear focus/menus
 */
export function useKeyboardShortcuts({
  shortcuts,
  enabled = true,
}: UseKeyboardShortcutsOptions): void {
  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (!enabled) {
        return;
      }

      if (shouldIgnoreEvent(event)) {
        return;
      }

      for (const shortcut of shortcuts) {
        if (matchesShortcut(event, shortcut)) {
          event.preventDefault();
          event.stopPropagation();
          shortcut.action();
          return;
        }
      }
    },
    [shortcuts, enabled]
  );

  useEffect(() => {
    if (!enabled) {
      return;
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [handleKeyDown, enabled]);
}

/**
 * Default shortcuts for the LFCC editor.
 */
export function createDefaultShortcuts(handlers: {
  onToggleSlashMenu?: () => void;
  onCreateAnnotation?: () => void;
  onEscape?: () => void;
}): ShortcutConfig[] {
  const shortcuts: ShortcutConfig[] = [];

  if (handlers.onToggleSlashMenu) {
    shortcuts.push({
      key: "k",
      meta: true,
      action: handlers.onToggleSlashMenu,
      description: "Toggle Slash Menu / Command Palette",
    });
  }

  if (handlers.onCreateAnnotation) {
    shortcuts.push({
      key: "a",
      meta: true,
      shift: true,
      action: handlers.onCreateAnnotation,
      description: "Create annotation from selection",
    });
  }

  if (handlers.onEscape) {
    shortcuts.push({
      key: "Escape",
      action: handlers.onEscape,
      description: "Clear focus and close menus",
    });
  }

  return shortcuts;
}
