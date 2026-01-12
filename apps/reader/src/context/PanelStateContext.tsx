"use client";

import * as React from "react";

const STORAGE_KEY = "ui-panel-state-v2";

interface PanelState {
  sidebarCollapsed: boolean;
  aiPanelVisible: boolean;
  sidebarWidth: number;
  aiPanelWidth: number;
  aiRequest: {
    prompt?: string;
    context?: string;
    docId?: string;
  } | null;
}

const DEFAULT_STATE: PanelState = {
  sidebarCollapsed: false,
  aiPanelVisible: true,
  sidebarWidth: 260,
  aiPanelWidth: 450,
  aiRequest: null,
};

interface PanelStateContextValue extends PanelState {
  isHydrated: boolean;
  setSidebarCollapsed: (collapsed: boolean) => void;
  setAIPanelVisible: (visible: boolean) => void;
  setSidebarWidth: (width: number) => void;
  setAIPanelWidth: (width: number) => void;
  setAIRequest: (request: PanelState["aiRequest"]) => void;
  toggleSidebar: () => void;
  toggleAIPanel: () => void;
}

const PanelStateContext = React.createContext<PanelStateContextValue | null>(null);

/**
 * Unified panel state provider.
 * Persists sidebar and AI panel visibility to localStorage.
 * Uses isHydrated flag to prevent SSR flash.
 */
// Helper to set cookie
function setCookie(name: string, value: string, days = 365) {
  if (typeof document === "undefined") {
    return;
  }
  const date = new Date();
  date.setTime(date.getTime() + days * 24 * 60 * 60 * 1000);
  document.cookie = `${name}=${value};expires=${date.toUTCString()};path=/`;
}

export interface PanelStateProviderProps {
  children: React.ReactNode;
  initialState?: Partial<PanelState>;
}

export function PanelStateProvider({ children, initialState }: PanelStateProviderProps) {
  const [state, setState] = React.useState<PanelState & { isHydrated: boolean }>({
    sidebarCollapsed: initialState?.sidebarCollapsed ?? DEFAULT_STATE.sidebarCollapsed,
    aiPanelVisible: initialState?.aiPanelVisible ?? DEFAULT_STATE.aiPanelVisible,
    sidebarWidth: initialState?.sidebarWidth ?? DEFAULT_STATE.sidebarWidth,
    aiPanelWidth: initialState?.aiPanelWidth ?? DEFAULT_STATE.aiPanelWidth,
    aiRequest: null,
    // If we have initial state from server, we are effectively hydrated for layout purposes
    isHydrated: !!initialState,
  });

  // Hydrate and set smart default on mount if no initial state provided
  React.useEffect(() => {
    if (!initialState) {
      let smartWidth = DEFAULT_STATE.aiPanelWidth;
      // Pixel mode: Defaults are robust enough, no need for window-based calculation unless window is very small
      if (typeof window !== "undefined") {
        const maxWidth = window.innerWidth * 0.4;
        // If 450px is more than 40% of screen (mobile), scale down, but 450 is reasonable
        if (smartWidth > maxWidth) {
          smartWidth = Math.max(300, maxWidth);
        }
      }

      setState((prev) => ({
        ...prev,
        isHydrated: true,
        aiPanelWidth: smartWidth,
      }));
    }
  }, [initialState]);

  // Persist to Cookies on state change
  React.useEffect(() => {
    // We update the cookie immediately when state changes
    const cookieValue = JSON.stringify({
      sidebarCollapsed: state.sidebarCollapsed,
      aiPanelVisible: state.aiPanelVisible,
      sidebarWidth: state.sidebarWidth,
      aiPanelWidth: state.aiPanelWidth,
    });
    setCookie(STORAGE_KEY, cookieValue);
  }, [state.sidebarCollapsed, state.aiPanelVisible, state.sidebarWidth, state.aiPanelWidth]);

  const setSidebarCollapsed = React.useCallback((collapsed: boolean) => {
    setState((prev) => ({ ...prev, sidebarCollapsed: collapsed }));
  }, []);

  const setAIPanelVisible = React.useCallback((visible: boolean) => {
    setState((prev) => ({ ...prev, aiPanelVisible: visible }));
  }, []);

  const setSidebarWidth = React.useCallback((width: number) => {
    setState((prev) => ({ ...prev, sidebarWidth: width }));
  }, []);

  const setAIPanelWidth = React.useCallback((width: number) => {
    setState((prev) => ({ ...prev, aiPanelWidth: width }));
  }, []);

  const setAIRequest = React.useCallback((request: PanelState["aiRequest"]) => {
    setState((prev) => ({ ...prev, aiRequest: request, aiPanelVisible: !!request }));
  }, []);

  const toggleSidebar = React.useCallback(() => {
    setState((prev) => ({ ...prev, sidebarCollapsed: !prev.sidebarCollapsed }));
  }, []);

  const toggleAIPanel = React.useCallback(() => {
    setState((prev) => ({ ...prev, aiPanelVisible: !prev.aiPanelVisible }));
  }, []);

  // Global shortcut: Cmd/Ctrl + \ to toggle sidebar
  React.useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const isMeta = event.metaKey || event.ctrlKey;
      if (isMeta && event.key === "\\") {
        event.preventDefault();
        toggleSidebar();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [toggleSidebar]);

  const value = React.useMemo(
    () => ({
      state,
      isHydrated: state.isHydrated,
      sidebarCollapsed: state.sidebarCollapsed,
      aiPanelVisible: state.aiPanelVisible,
      sidebarWidth: state.sidebarWidth,
      aiPanelWidth: state.aiPanelWidth,
      aiRequest: state.aiRequest,
      setSidebarCollapsed,
      setAIPanelVisible,
      setSidebarWidth,
      setAIPanelWidth,
      setAIRequest,
      toggleSidebar,
      toggleAIPanel,
    }),
    [
      state,
      setSidebarCollapsed,
      setAIPanelVisible,
      setSidebarWidth,
      setAIPanelWidth,
      setAIRequest,
      toggleSidebar,
      toggleAIPanel,
    ]
  );

  return <PanelStateContext.Provider value={value}>{children}</PanelStateContext.Provider>;
}

export function usePanelState() {
  const context = React.useContext(PanelStateContext);
  if (!context) {
    throw new Error("usePanelState must be used within PanelStateProvider");
  }
  return context;
}

/**
 * Hook for sidebar state (convenience wrapper).
 */
export function useSidebarCollapsed() {
  const {
    sidebarCollapsed,
    isHydrated,
    setSidebarCollapsed,
    toggleSidebar,
    sidebarWidth,
    setSidebarWidth,
  } = usePanelState();
  return {
    isCollapsed: sidebarCollapsed,
    isHydrated,
    width: sidebarWidth,
    setWidth: setSidebarWidth,
    setIsCollapsed: setSidebarCollapsed,
    toggleCollapsed: toggleSidebar,
    expandSidebar: () => setSidebarCollapsed(false),
  };
}

/**
 * Hook for AI panel state (convenience wrapper).
 */
export function useAIPanelState() {
  const {
    aiPanelVisible,
    isHydrated,
    setAIPanelVisible,
    toggleAIPanel,
    aiPanelWidth,
    setAIPanelWidth,
    aiRequest,
    setAIRequest,
  } = usePanelState();
  return {
    isVisible: aiPanelVisible,
    isHydrated,
    width: aiPanelWidth,
    setWidth: setAIPanelWidth,
    setVisible: setAIPanelVisible,
    toggle: toggleAIPanel,
    aiRequest,
    setAIRequest,
  };
}
