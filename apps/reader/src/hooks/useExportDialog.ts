"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Hook to manage the export dialog state.
 * Listens for the custom event dispatched by the slash command.
 */
export function useExportDialog() {
  const [isOpen, setIsOpen] = useState(false);

  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);

  useEffect(() => {
    const handler = () => {
      setIsOpen(true);
    };

    window.addEventListener("lfcc:open-export-dialog", handler);
    return () => {
      window.removeEventListener("lfcc:open-export-dialog", handler);
    };
  }, []);

  return { isOpen, open, close };
}
