"use client";

import * as React from "react";

const STORAGE_KEY = "ai-panel-visible";

/**
 * Hook to persist AI panel visibility state in localStorage.
 * Returns isHydrated=false until localStorage is read to prevent SSR mismatch.
 */
export function useAIPanelVisibility() {
  const [state, setState] = React.useState<{ isVisible: boolean; isHydrated: boolean }>({
    isVisible: false, // Start false to prevent flash
    isHydrated: false,
  });

  // Load from localStorage on mount (client only)
  React.useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    const isVisible = stored === null ? true : stored === "true"; // Default true on first visit
    setState({ isVisible, isHydrated: true });
  }, []);

  // Persist to localStorage when state changes
  const setVisible = React.useCallback((visible: boolean) => {
    setState((prev) => ({ ...prev, isVisible: visible }));
    localStorage.setItem(STORAGE_KEY, String(visible));
  }, []);

  return {
    isVisible: state.isVisible,
    setVisible,
    isHydrated: state.isHydrated,
  };
}
