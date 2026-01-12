"use client";

import * as React from "react";

// ============================================================================
// Types
// ============================================================================

export interface Tab {
  id: string;
  title: string;
  /** Document ID or route path */
  documentId: string;
  /** Icon identifier (optional) */
  icon?: string;
  /** Whether the tab has unsaved changes */
  isDirty?: boolean;
  /** Timestamp for LRU sorting */
  lastAccessed: number;
}

export interface Pane {
  id: string;
  tabs: Tab[];
  activeTabId: string | null;
}

export type SplitDirection = "horizontal" | "vertical";

export interface TabState {
  /** All panes in the layout (1 = single view, 2 = split view) */
  panes: Pane[];
  /** Currently focused pane index */
  activePaneIndex: number;
  /** Split ratio as percentage (0-100) for first pane */
  splitRatio: number;
  /** Direction of split */
  splitDirection: SplitDirection;
}

// ============================================================================
// Actions
// ============================================================================

type TabAction =
  | { type: "ADD_TAB"; paneIndex: number; tab: Tab }
  | { type: "CLOSE_TAB"; paneIndex: number; tabId: string }
  | { type: "ACTIVATE_TAB"; paneIndex: number; tabId: string }
  | { type: "MOVE_TAB"; fromPane: number; toPane: number; tabId: string; insertIndex?: number }
  | { type: "REORDER_TAB"; paneIndex: number; fromIndex: number; toIndex: number }
  | { type: "UPDATE_TAB"; paneIndex: number; tabId: string; updates: Partial<Tab> }
  | { type: "SPLIT_VIEW"; tabId: string; direction: SplitDirection }
  | { type: "CLOSE_PANE"; paneIndex: number }
  | { type: "SET_SPLIT_RATIO"; ratio: number }
  | { type: "SET_ACTIVE_PANE"; paneIndex: number }
  | { type: "SWAP_PANES" }
  | { type: "TOGGLE_SPLIT_DIRECTION" }
  | { type: "RESET_SPLIT_RATIO" }
  | { type: "MAXIMIZE_PANE"; paneIndex: number }
  | { type: "OPEN_TO_SIDE"; documentId: string; title: string }
  | { type: "RESTORE_STATE"; state: TabState };

// ============================================================================
// Reducer
// ============================================================================

function createPane(id?: string): Pane {
  return {
    id: id ?? crypto.randomUUID(),
    tabs: [],
    activeTabId: null,
  };
}

const INITIAL_STATE: TabState = {
  panes: [createPane("main")],
  activePaneIndex: 0,
  splitRatio: 50,
  splitDirection: "horizontal",
};

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Complex reducer with many action types is expected
function tabReducer(state: TabState, action: TabAction): TabState {
  switch (action.type) {
    case "ADD_TAB": {
      const { paneIndex, tab } = action;
      const panes = [...state.panes];
      const pane = { ...panes[paneIndex] };

      // Check if tab already exists
      const existingIndex = pane.tabs.findIndex((t) => t.documentId === tab.documentId);
      if (existingIndex !== -1) {
        // Activate existing tab
        pane.activeTabId = pane.tabs[existingIndex].id;
        pane.tabs = pane.tabs.map((t, i) =>
          i === existingIndex ? { ...t, lastAccessed: Date.now() } : t
        );
      } else {
        // Add new tab
        pane.tabs = [...pane.tabs, tab];
        pane.activeTabId = tab.id;
      }

      panes[paneIndex] = pane;
      return { ...state, panes, activePaneIndex: paneIndex };
    }

    case "CLOSE_TAB": {
      const { paneIndex, tabId } = action;
      const panes = [...state.panes];
      const pane = { ...panes[paneIndex] };

      const tabIndex = pane.tabs.findIndex((t) => t.id === tabId);
      if (tabIndex === -1) {
        return state;
      }

      pane.tabs = pane.tabs.filter((t) => t.id !== tabId);

      // Update active tab if we closed the active one
      if (pane.activeTabId === tabId) {
        // Prefer tab to the right, then left
        const newIndex = Math.min(tabIndex, pane.tabs.length - 1);
        pane.activeTabId = pane.tabs[newIndex]?.id ?? null;
      }

      panes[paneIndex] = pane;

      // If pane is empty and we have split view, close the pane
      if (pane.tabs.length === 0 && panes.length > 1) {
        const remainingPanes = panes.filter((_, i) => i !== paneIndex);
        return {
          ...state,
          panes: remainingPanes,
          activePaneIndex: Math.max(
            0,
            state.activePaneIndex - (paneIndex <= state.activePaneIndex ? 1 : 0)
          ),
        };
      }

      return { ...state, panes };
    }

    case "ACTIVATE_TAB": {
      const { paneIndex, tabId } = action;
      const panes = [...state.panes];
      const pane = { ...panes[paneIndex] };

      pane.activeTabId = tabId;
      pane.tabs = pane.tabs.map((t) => (t.id === tabId ? { ...t, lastAccessed: Date.now() } : t));

      panes[paneIndex] = pane;
      return { ...state, panes, activePaneIndex: paneIndex };
    }

    case "MOVE_TAB": {
      const { fromPane, toPane, tabId, insertIndex } = action;
      if (fromPane === toPane) {
        return state;
      }

      const panes = [...state.panes];
      const sourcePaneData = { ...panes[fromPane] };
      const targetPaneData = { ...panes[toPane] };

      const tab = sourcePaneData.tabs.find((t) => t.id === tabId);
      if (!tab) {
        return state;
      }

      // Remove from source
      sourcePaneData.tabs = sourcePaneData.tabs.filter((t) => t.id !== tabId);
      if (sourcePaneData.activeTabId === tabId) {
        sourcePaneData.activeTabId = sourcePaneData.tabs[0]?.id ?? null;
      }

      // Add to target
      const newTabs = [...targetPaneData.tabs];
      const idx = insertIndex ?? newTabs.length;
      newTabs.splice(idx, 0, { ...tab, lastAccessed: Date.now() });
      targetPaneData.tabs = newTabs;
      targetPaneData.activeTabId = tab.id;

      panes[fromPane] = sourcePaneData;
      panes[toPane] = targetPaneData;

      // Remove empty source pane if in split view
      if (sourcePaneData.tabs.length === 0 && panes.length > 1) {
        const remainingPanes = panes.filter((_, i) => i !== fromPane);
        return {
          ...state,
          panes: remainingPanes,
          activePaneIndex: toPane > fromPane ? toPane - 1 : toPane,
        };
      }

      return { ...state, panes, activePaneIndex: toPane };
    }

    case "REORDER_TAB": {
      const { paneIndex, fromIndex, toIndex } = action;
      if (fromIndex === toIndex) {
        return state;
      }

      const panes = [...state.panes];
      const pane = { ...panes[paneIndex] };
      const tabs = [...pane.tabs];

      const [movedTab] = tabs.splice(fromIndex, 1);
      tabs.splice(toIndex, 0, movedTab);

      pane.tabs = tabs;
      panes[paneIndex] = pane;

      return { ...state, panes };
    }

    case "UPDATE_TAB": {
      const { paneIndex, tabId, updates } = action;
      const panes = [...state.panes];
      const pane = { ...panes[paneIndex] };

      pane.tabs = pane.tabs.map((t) => (t.id === tabId ? { ...t, ...updates } : t));

      panes[paneIndex] = pane;
      return { ...state, panes };
    }

    case "SPLIT_VIEW": {
      const { tabId, direction } = action;
      if (state.panes.length >= 2) {
        return state; // Already split
      }

      const sourcePane = state.panes[0];
      const tab = sourcePane.tabs.find((t) => t.id === tabId);
      if (!tab) {
        return state;
      }

      // Create new pane with the tab
      const newPane = createPane();
      newPane.tabs = [{ ...tab, lastAccessed: Date.now() }];
      newPane.activeTabId = tab.id;

      // Remove tab from source
      const updatedSourcePane = {
        ...sourcePane,
        tabs: sourcePane.tabs.filter((t) => t.id !== tabId),
      };
      if (updatedSourcePane.activeTabId === tabId) {
        updatedSourcePane.activeTabId = updatedSourcePane.tabs[0]?.id ?? null;
      }

      return {
        ...state,
        panes: [updatedSourcePane, newPane],
        activePaneIndex: 1,
        splitDirection: direction,
      };
    }

    case "CLOSE_PANE": {
      const { paneIndex } = action;
      if (state.panes.length <= 1) {
        return state;
      }

      const closingPane = state.panes[paneIndex];
      const targetPaneIndex = paneIndex === 0 ? 1 : 0;
      const targetPane = { ...state.panes[targetPaneIndex] };

      // Move all tabs to the other pane
      targetPane.tabs = [...targetPane.tabs, ...closingPane.tabs];

      return {
        ...state,
        panes: [targetPane],
        activePaneIndex: 0,
      };
    }

    case "SET_SPLIT_RATIO": {
      return { ...state, splitRatio: Math.max(20, Math.min(80, action.ratio)) };
    }

    case "SET_ACTIVE_PANE": {
      return { ...state, activePaneIndex: action.paneIndex };
    }

    case "SWAP_PANES": {
      if (state.panes.length < 2) {
        return state;
      }
      return {
        ...state,
        panes: [state.panes[1], state.panes[0]],
        activePaneIndex: state.activePaneIndex === 0 ? 1 : 0,
      };
    }

    case "TOGGLE_SPLIT_DIRECTION": {
      if (state.panes.length < 2) {
        return state;
      }
      return {
        ...state,
        splitDirection: state.splitDirection === "horizontal" ? "vertical" : "horizontal",
      };
    }

    case "RESET_SPLIT_RATIO": {
      return { ...state, splitRatio: 50 };
    }

    case "MAXIMIZE_PANE": {
      if (state.panes.length < 2) {
        return state;
      }
      const { paneIndex } = action;
      // Set ratio to 80% for the target pane
      const newRatio = paneIndex === 0 ? 80 : 20;
      return { ...state, splitRatio: newRatio, activePaneIndex: paneIndex };
    }

    case "OPEN_TO_SIDE": {
      const { documentId, title } = action;
      const newTab: Tab = {
        id: crypto.randomUUID(),
        title,
        documentId,
        lastAccessed: Date.now(),
      };

      // If already split, add to the non-active pane
      if (state.panes.length >= 2) {
        const targetPaneIndex = state.activePaneIndex === 0 ? 1 : 0;
        const panes = [...state.panes];
        const pane = { ...panes[targetPaneIndex] };

        // Check if already open
        const existing = pane.tabs.find((t) => t.documentId === documentId);
        if (existing) {
          pane.activeTabId = existing.id;
        } else {
          pane.tabs = [...pane.tabs, newTab];
          pane.activeTabId = newTab.id;
        }
        panes[targetPaneIndex] = pane;
        return { ...state, panes, activePaneIndex: targetPaneIndex };
      }

      // Create new split with the document
      const newPane = createPane();
      newPane.tabs = [newTab];
      newPane.activeTabId = newTab.id;

      return {
        ...state,
        panes: [...state.panes, newPane],
        activePaneIndex: 1,
        splitDirection: "horizontal",
      };
    }

    case "RESTORE_STATE": {
      return action.state;
    }

    default:
      return state;
  }
}

// ============================================================================
// Context
// ============================================================================

interface TabContextValue {
  state: TabState;
  // Tab operations
  openTab: (documentId: string, title: string, paneIndex?: number) => void;
  closeTab: (tabId: string, paneIndex?: number) => void;
  activateTab: (tabId: string, paneIndex: number) => void;
  moveTab: (tabId: string, fromPane: number, toPane: number, insertIndex?: number) => void;
  reorderTab: (paneIndex: number, fromIndex: number, toIndex: number) => void;
  updateTab: (tabId: string, paneIndex: number, updates: Partial<Tab>) => void;
  // Split operations
  splitWithTab: (tabId: string, direction?: SplitDirection) => void;
  closePane: (paneIndex: number) => void;
  setSplitRatio: (ratio: number) => void;
  setActivePane: (paneIndex: number) => void;
  swapPanes: () => void;
  toggleSplitDirection: () => void;
  resetSplitRatio: () => void;
  maximizePane: (paneIndex: number) => void;
  openToSide: (documentId: string, title: string) => void;
  // Helpers
  getActiveTab: (paneIndex?: number) => Tab | null;
  isSplitView: boolean;
}

const TabContext = React.createContext<TabContextValue | null>(null);

// ============================================================================
// Provider
// ============================================================================

const STORAGE_KEY = "tab-state-v1";

function loadState(): TabState | null {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored) as TabState;
      // Validate structure
      if (parsed.panes && Array.isArray(parsed.panes) && parsed.panes.length > 0) {
        return parsed;
      }
    }
  } catch {
    // Ignore parse errors
  }
  return null;
}

function saveState(state: TabState) {
  if (typeof window === "undefined") {
    return;
  }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Ignore storage errors
  }
}

export function TabProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = React.useReducer(tabReducer, INITIAL_STATE);
  const [isHydrated, setIsHydrated] = React.useState(false);

  // Hydrate from localStorage
  React.useEffect(() => {
    const stored = loadState();
    if (stored) {
      dispatch({ type: "RESTORE_STATE", state: stored });
    }
    setIsHydrated(true);
  }, []);

  // Persist to localStorage
  React.useEffect(() => {
    if (isHydrated) {
      saveState(state);
    }
  }, [state, isHydrated]);

  // ---- Actions ----

  const openTab = React.useCallback((documentId: string, title: string, paneIndex = 0) => {
    const tab: Tab = {
      id: crypto.randomUUID(),
      title,
      documentId,
      lastAccessed: Date.now(),
    };
    dispatch({ type: "ADD_TAB", paneIndex, tab });
  }, []);

  const closeTab = React.useCallback(
    (tabId: string, paneIndex?: number) => {
      const idx = paneIndex ?? state.activePaneIndex;
      dispatch({ type: "CLOSE_TAB", paneIndex: idx, tabId });
    },
    [state.activePaneIndex]
  );

  const activateTab = React.useCallback((tabId: string, paneIndex: number) => {
    dispatch({ type: "ACTIVATE_TAB", paneIndex, tabId });
  }, []);

  const moveTab = React.useCallback(
    (tabId: string, fromPane: number, toPane: number, insertIndex?: number) => {
      dispatch({ type: "MOVE_TAB", fromPane, toPane, tabId, insertIndex });
    },
    []
  );

  const reorderTab = React.useCallback((paneIndex: number, fromIndex: number, toIndex: number) => {
    dispatch({ type: "REORDER_TAB", paneIndex, fromIndex, toIndex });
  }, []);

  const updateTab = React.useCallback((tabId: string, paneIndex: number, updates: Partial<Tab>) => {
    dispatch({ type: "UPDATE_TAB", paneIndex, tabId, updates });
  }, []);

  const splitWithTab = React.useCallback(
    (tabId: string, direction: SplitDirection = "horizontal") => {
      dispatch({ type: "SPLIT_VIEW", tabId, direction });
    },
    []
  );

  const closePane = React.useCallback((paneIndex: number) => {
    dispatch({ type: "CLOSE_PANE", paneIndex });
  }, []);

  const setSplitRatio = React.useCallback((ratio: number) => {
    dispatch({ type: "SET_SPLIT_RATIO", ratio });
  }, []);

  const setActivePane = React.useCallback((paneIndex: number) => {
    dispatch({ type: "SET_ACTIVE_PANE", paneIndex });
  }, []);

  const swapPanes = React.useCallback(() => {
    dispatch({ type: "SWAP_PANES" });
  }, []);

  const toggleSplitDirection = React.useCallback(() => {
    dispatch({ type: "TOGGLE_SPLIT_DIRECTION" });
  }, []);

  const resetSplitRatio = React.useCallback(() => {
    dispatch({ type: "RESET_SPLIT_RATIO" });
  }, []);

  const maximizePane = React.useCallback((paneIndex: number) => {
    dispatch({ type: "MAXIMIZE_PANE", paneIndex });
  }, []);

  const openToSide = React.useCallback((documentId: string, title: string) => {
    dispatch({ type: "OPEN_TO_SIDE", documentId, title });
  }, []);

  const getActiveTab = React.useCallback(
    (paneIndex?: number): Tab | null => {
      const idx = paneIndex ?? state.activePaneIndex;
      const pane = state.panes[idx];
      if (!pane?.activeTabId) {
        return null;
      }
      return pane.tabs.find((t) => t.id === pane.activeTabId) ?? null;
    },
    [state.panes, state.activePaneIndex]
  );

  const value = React.useMemo<TabContextValue>(
    () => ({
      state,
      openTab,
      closeTab,
      activateTab,
      moveTab,
      reorderTab,
      updateTab,
      splitWithTab,
      closePane,
      setSplitRatio,
      setActivePane,
      swapPanes,
      toggleSplitDirection,
      resetSplitRatio,
      maximizePane,
      openToSide,
      getActiveTab,
      isSplitView: state.panes.length > 1,
    }),
    [
      state,
      openTab,
      closeTab,
      activateTab,
      moveTab,
      reorderTab,
      updateTab,
      splitWithTab,
      closePane,
      setSplitRatio,
      setActivePane,
      swapPanes,
      toggleSplitDirection,
      resetSplitRatio,
      maximizePane,
      openToSide,
      getActiveTab,
    ]
  );

  return <TabContext.Provider value={value}>{children}</TabContext.Provider>;
}

// ============================================================================
// Hooks
// ============================================================================

export function useTabContext() {
  const context = React.useContext(TabContext);
  if (!context) {
    throw new Error("useTabContext must be used within TabProvider");
  }
  return context;
}

/**
 * Hook to get tabs for a specific pane.
 */
export function usePaneTabs(paneIndex: number) {
  const { state, activateTab, closeTab, reorderTab } = useTabContext();
  const pane = state.panes[paneIndex];

  return {
    tabs: pane?.tabs ?? [],
    activeTabId: pane?.activeTabId ?? null,
    activateTab: (tabId: string) => activateTab(tabId, paneIndex),
    closeTab: (tabId: string) => closeTab(tabId, paneIndex),
    reorderTab: (fromIndex: number, toIndex: number) => reorderTab(paneIndex, fromIndex, toIndex),
  };
}
