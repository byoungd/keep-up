"use client";

import { type Tab, TabProvider, useTabContext } from "@/context/TabContext";
import { SplitViewCommands } from "@/hooks/useSplitViewCommands";
import { TabKeyboardShortcuts } from "@/hooks/useTabKeyboardShortcuts";
import { cn } from "@keepup/shared/utils";
import * as React from "react";
import { SplitViewContainer } from "./SplitViewContainer";

// ============================================================================
// Types
// ============================================================================

export interface TabbedContentAreaProps {
  /**
   * Render function that receives the active tab's documentId and returns the content.
   * This allows the parent to control how documents are rendered.
   */
  renderDocument: (documentId: string, paneIndex: number) => React.ReactNode;

  /**
   * Called when a tab is activated (for URL sync, analytics, etc.)
   */
  onTabActivate?: (documentId: string) => void;

  /**
   * Initial document to open (if no tabs exist)
   */
  initialDocumentId?: string;

  /**
   * Initial document title
   */
  initialDocumentTitle?: string;

  /**
   * Empty state when no tabs are open
   */
  emptyState?: React.ReactNode;

  /**
   * Additional class name
   */
  className?: string;
}

// ============================================================================
// Inner Component (uses context)
// ============================================================================

function TabbedContentAreaInner({
  renderDocument,
  onTabActivate,
  initialDocumentId,
  initialDocumentTitle,
  emptyState,
  className,
}: TabbedContentAreaProps) {
  const { state, openTab, getActiveTab } = useTabContext();
  const hasInitialized = React.useRef(false);

  // Open initial document if provided and no tabs exist
  React.useEffect(() => {
    if (hasInitialized.current) {
      return;
    }
    hasInitialized.current = true;

    const mainPane = state.panes[0];
    if (mainPane.tabs.length === 0 && initialDocumentId) {
      openTab(initialDocumentId, initialDocumentTitle ?? "Document", 0);
    }
  }, [initialDocumentId, initialDocumentTitle, openTab, state.panes]);

  // Notify parent when active tab changes
  React.useEffect(() => {
    const activeTab = getActiveTab();
    if (activeTab && onTabActivate) {
      onTabActivate(activeTab.documentId);
    }
  }, [getActiveTab, onTabActivate]);

  const renderContent = React.useCallback(
    (tab: Tab, paneIndex: number) => {
      return renderDocument(tab.documentId, paneIndex);
    },
    [renderDocument]
  );

  return (
    <div className={cn("h-full w-full", className)}>
      <TabKeyboardShortcuts />
      <SplitViewCommands />
      <SplitViewContainer renderContent={renderContent} emptyState={emptyState} />
    </div>
  );
}

// ============================================================================
// Main Component (provides context)
// ============================================================================

export function TabbedContentArea(props: TabbedContentAreaProps) {
  return (
    <TabProvider>
      <TabbedContentAreaInner {...props} />
    </TabProvider>
  );
}

// ============================================================================
// Hook for external tab control
// ============================================================================

/**
 * Hook to control tabs from outside the TabbedContentArea.
 * Must be used within TabProvider.
 *
 * @example
 * ```tsx
 * function DocumentList() {
 *   const { openDocument, closeDocument } = useTabControl();
 *
 *   return (
 *     <button onClick={() => openDocument("doc-123", "My Document")}>
 *       Open Document
 *     </button>
 *   );
 * }
 * ```
 */
export function useTabControl() {
  const { openTab, closeTab, state, getActiveTab, splitWithTab, isSplitView } = useTabContext();

  const openDocument = React.useCallback(
    (documentId: string, title: string, inNewPane = false) => {
      if (inNewPane && !isSplitView) {
        // Open in new split pane
        openTab(documentId, title, 0);
        const tab = state.panes[0].tabs.find((t) => t.documentId === documentId);
        if (tab) {
          splitWithTab(tab.id, "horizontal");
        }
      } else {
        // Open in active pane
        openTab(documentId, title, state.activePaneIndex);
      }
    },
    [openTab, state.activePaneIndex, state.panes, splitWithTab, isSplitView]
  );

  const closeDocument = React.useCallback(
    (documentId: string) => {
      // Find and close the tab with this documentId
      for (let paneIndex = 0; paneIndex < state.panes.length; paneIndex++) {
        const tab = state.panes[paneIndex].tabs.find((t) => t.documentId === documentId);
        if (tab) {
          closeTab(tab.id, paneIndex);
          break;
        }
      }
    },
    [state.panes, closeTab]
  );

  const getActiveDocumentId = React.useCallback(() => {
    const activeTab = getActiveTab();
    return activeTab?.documentId ?? null;
  }, [getActiveTab]);

  return {
    openDocument,
    closeDocument,
    getActiveDocumentId,
    isSplitView,
  };
}
