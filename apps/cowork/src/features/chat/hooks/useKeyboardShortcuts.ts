import { useEffect } from "react";

interface ShortcutConfig {
  onSend?: () => void;
  onNewSession?: () => void;
  onSearch?: () => void;
  onToggleMode?: () => void;
}

export function useKeyboardShortcuts({
  onSend,
  onNewSession,
  onSearch,
  onToggleMode,
}: ShortcutConfig) {
  useEffect(() => {
    const handlers: Record<string, (() => void) | undefined> = {
      Enter: onSend,
      n: onNewSession,
      k: onSearch,
      ".": onToggleMode,
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      const isMeta = e.metaKey || e.ctrlKey;
      if (!isMeta) {
        return;
      }

      const handler = handlers[e.key];
      if (handler) {
        e.preventDefault();
        handler();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onSend, onNewSession, onSearch, onToggleMode]);
}
