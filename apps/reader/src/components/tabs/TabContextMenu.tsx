"use client";

import { type Tab, useTabContext } from "@/context/TabContext";
import { cn } from "@ku0/shared/utils";
import {
  ArrowLeftRight,
  Copy,
  ExternalLink,
  PanelRight,
  SplitSquareHorizontal,
  SplitSquareVertical,
  X,
  XCircle,
} from "lucide-react";
import * as React from "react";
import { createPortal } from "react-dom";

// ============================================================================
// Types
// ============================================================================

interface TabContextMenuProps {
  tab: Tab;
  paneIndex: number;
  position: { x: number; y: number };
  onClose: () => void;
}

interface MenuItemProps {
  icon: React.ReactNode;
  label: string;
  shortcut?: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}

// ============================================================================
// MenuItem Component
// ============================================================================

function MenuItem({ icon, label, shortcut, onClick, disabled, danger }: MenuItemProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex items-center gap-3 w-full px-3 py-2 text-sm text-left rounded-md transition-colors",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50",
        disabled
          ? "text-muted-foreground/50 cursor-not-allowed"
          : danger
            ? "text-destructive hover:bg-destructive/10"
            : "text-foreground hover:bg-surface-2"
      )}
    >
      <span className="w-4 h-4 shrink-0">{icon}</span>
      <span className="flex-1">{label}</span>
      {shortcut && <span className="text-xs text-muted-foreground">{shortcut}</span>}
    </button>
  );
}

function MenuDivider() {
  return <div className="my-1 h-px bg-border/50" />;
}

// ============================================================================
// TabContextMenu Component
// ============================================================================

export function TabContextMenu({ tab, paneIndex, position, onClose }: TabContextMenuProps) {
  const menuRef = React.useRef<HTMLDivElement>(null);
  const { state, closeTab, splitWithTab, openToSide, isSplitView } = useTabContext();

  const currentPane = state.panes[paneIndex];
  const tabCount = currentPane?.tabs.length ?? 0;
  const canSplit = tabCount >= 2 && !isSplitView;

  // Close menu on click outside
  React.useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  // Adjust position to keep menu in viewport
  const [adjustedPosition, setAdjustedPosition] = React.useState(position);

  React.useEffect(() => {
    if (menuRef.current) {
      const rect = menuRef.current.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;

      let x = position.x;
      let y = position.y;

      // Adjust horizontally
      if (x + rect.width > viewportWidth - 8) {
        x = viewportWidth - rect.width - 8;
      }

      // Adjust vertically
      if (y + rect.height > viewportHeight - 8) {
        y = viewportHeight - rect.height - 8;
      }

      setAdjustedPosition({ x, y });
    }
  }, [position]);

  const handleClose = () => {
    closeTab(tab.id, paneIndex);
    onClose();
  };

  const handleCloseOthers = () => {
    const otherTabs = currentPane?.tabs.filter((t) => t.id !== tab.id) ?? [];
    for (const t of otherTabs) {
      closeTab(t.id, paneIndex);
    }
    onClose();
  };

  const handleCloseAll = () => {
    const allTabs = currentPane?.tabs ?? [];
    for (const t of allTabs) {
      closeTab(t.id, paneIndex);
    }
    onClose();
  };

  const handleSplitRight = () => {
    splitWithTab(tab.id, "horizontal");
    onClose();
  };

  const handleSplitDown = () => {
    splitWithTab(tab.id, "vertical");
    onClose();
  };

  const handleOpenToSide = () => {
    openToSide(tab.documentId, tab.title);
    onClose();
  };

  const handleCopyPath = () => {
    navigator.clipboard.writeText(tab.documentId);
    onClose();
  };

  const handleOpenInNewWindow = () => {
    // Open the document in a new browser window/tab
    window.open(`/reader/${tab.documentId}`, "_blank");
    onClose();
  };

  if (typeof window === "undefined") {
    return null;
  }

  return createPortal(
    <div
      ref={menuRef}
      role="menu"
      aria-label="Tab options"
      className={cn(
        "fixed z-dropdown min-w-[200px] p-1.5 rounded-lg",
        "bg-surface-1/95 backdrop-blur-xl border border-border/40",
        "shadow-xl ring-1 ring-black/5 dark:ring-white/10",
        "animate-in fade-in-0 zoom-in-95 duration-100"
      )}
      style={{
        left: adjustedPosition.x,
        top: adjustedPosition.y,
      }}
    >
      {/* Split options */}
      <MenuItem
        icon={<SplitSquareHorizontal className="w-4 h-4" />}
        label="Split Right"
        onClick={handleSplitRight}
        disabled={!canSplit}
      />
      <MenuItem
        icon={<SplitSquareVertical className="w-4 h-4" />}
        label="Split Down"
        onClick={handleSplitDown}
        disabled={!canSplit}
      />
      {isSplitView && (
        <MenuItem
          icon={<ArrowLeftRight className="w-4 h-4" />}
          label="Move to Other Pane"
          onClick={handleOpenToSide}
        />
      )}

      <MenuDivider />

      {/* Open options */}
      <MenuItem
        icon={<PanelRight className="w-4 h-4" />}
        label="Open to the Side"
        onClick={handleOpenToSide}
        disabled={isSplitView}
      />
      <MenuItem
        icon={<ExternalLink className="w-4 h-4" />}
        label="Open in New Window"
        onClick={handleOpenInNewWindow}
      />
      <MenuItem icon={<Copy className="w-4 h-4" />} label="Copy Path" onClick={handleCopyPath} />

      <MenuDivider />

      {/* Close options */}
      <MenuItem
        icon={<X className="w-4 h-4" />}
        label="Close"
        shortcut="⌘W"
        onClick={handleClose}
      />
      <MenuItem
        icon={<XCircle className="w-4 h-4" />}
        label="Close Others"
        onClick={handleCloseOthers}
        disabled={tabCount <= 1}
      />
      <MenuItem
        icon={<XCircle className="w-4 h-4" />}
        label="Close All"
        onClick={handleCloseAll}
        danger
      />
    </div>,
    document.body
  );
}

// ============================================================================
// Hook for context menu state
// ============================================================================

export interface ContextMenuState {
  tab: Tab;
  paneIndex: number;
  position: { x: number; y: number };
}

export function useTabContextMenu() {
  const [menuState, setMenuState] = React.useState<ContextMenuState | null>(null);

  const openMenu = React.useCallback((tab: Tab, paneIndex: number, event: React.MouseEvent) => {
    event.preventDefault();
    setMenuState({
      tab,
      paneIndex,
      position: { x: event.clientX, y: event.clientY },
    });
  }, []);

  const closeMenu = React.useCallback(() => {
    setMenuState(null);
  }, []);

  return {
    menuState,
    openMenu,
    closeMenu,
  };
}
