"use client";

import { cn } from "@ku0/shared/utils";
import { Copy, Link, MoreHorizontal, Trash2, Type } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export type BlockContextMenuAction = "duplicate" | "delete" | "turnInto" | "copyLink";

export type BlockContextMenuProps = {
  blockId: string;
  position: { x: number; y: number };
  onAction: (action: BlockContextMenuAction) => void;
  onClose: () => void;
};

const menuItems: Array<{
  action: BlockContextMenuAction;
  label: string;
  icon: React.ReactNode;
  shortcut?: string;
}> = [
  { action: "duplicate", label: "Duplicate", icon: <Copy className="h-4 w-4" />, shortcut: "⌘D" },
  { action: "delete", label: "Delete", icon: <Trash2 className="h-4 w-4" />, shortcut: "⌫" },
  { action: "turnInto", label: "Turn into...", icon: <Type className="h-4 w-4" /> },
  { action: "copyLink", label: "Copy link", icon: <Link className="h-4 w-4" /> },
];

export function BlockContextMenu({ blockId, position, onAction, onClose }: BlockContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [deleteConfirm, setDeleteConfirm] = useState(false);

  // Close on click outside
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    const handleArrowDown = (event: KeyboardEvent) => {
      event.preventDefault();
      setSelectedIndex((i) => (i + 1) % menuItems.length);
    };

    const handleArrowUp = (event: KeyboardEvent) => {
      event.preventDefault();
      setSelectedIndex((i) => (i - 1 + menuItems.length) % menuItems.length);
    };

    const handleEnter = (event: KeyboardEvent) => {
      event.preventDefault();
      const item = menuItems[selectedIndex];
      if (item.action === "delete" && !deleteConfirm) {
        setDeleteConfirm(true);
        return;
      }
      onAction(item.action);
      onClose();
    };

    const keyHandlers: Record<string, (event: KeyboardEvent) => void> = {
      Escape: () => onClose(),
      ArrowDown: handleArrowDown,
      ArrowUp: handleArrowUp,
      Enter: handleEnter,
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      const handler = keyHandlers[event.key];
      if (handler) {
        handler(event);
      }
    };

    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose, selectedIndex, deleteConfirm, onAction]); // Dependencies are fine now that useState is imported

  // Reset delete confirm if selection changes
  useEffect(() => {
    if (selectedIndex >= 0) {
      setDeleteConfirm(false);
    }
  }, [selectedIndex]);

  const style: React.CSSProperties = {
    position: "fixed",
    top: position.y,
    left: position.x,
  };

  return createPortal(
    <div
      ref={menuRef}
      style={style}
      className={cn(
        "min-w-[180px] rounded-lg border border-border bg-popover p-1 shadow-lg z-9999",
        "animate-in fade-in-0 zoom-in-95"
      )}
      role="menu"
      data-block-id={blockId}
    >
      {menuItems.map((item, index) => {
        const isSelected = index === selectedIndex;
        const isDelete = item.action === "delete";

        return (
          <button
            key={item.action}
            type="button"
            role="menuitem"
            // aria-selected removed as it's not valid for menuitem
            onClick={() => {
              if (isDelete && !deleteConfirm) {
                setDeleteConfirm(true);
                setSelectedIndex(index); // Ensure selection follows click
                return;
              }
              onAction(item.action);
              onClose();
            }}
            onMouseEnter={() => setSelectedIndex(index)}
            className={cn(
              "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm",
              "transition-colors duration-100",
              isSelected ? "bg-accent text-accent-foreground" : "text-foreground",
              isDelete &&
                deleteConfirm &&
                "bg-destructive/10 text-destructive hover:bg-destructive/15"
            )}
          >
            <span
              className={cn(
                "text-muted-foreground",
                isSelected && "text-accent-foreground",
                isDelete && deleteConfirm && "text-destructive"
              )}
            >
              {item.icon}
            </span>
            <span className="flex-1 text-left">
              {isDelete && deleteConfirm ? "Confirm delete?" : item.label}
            </span>
            {item.shortcut && (
              <span className="text-xs text-muted-foreground">{item.shortcut}</span>
            )}
          </button>
        );
      })}
    </div>,
    document.body
  );
}

/**
 * Trigger button for context menu (can be placed in gutter)
 */
export function BlockMenuTrigger({ onClick }: { onClick: (e: React.MouseEvent) => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center justify-center h-5 w-5 rounded-sm",
        "text-muted-foreground/40 hover:text-muted-foreground",
        "hover:bg-muted transition-colors duration-100"
      )}
      aria-label="Block menu"
    >
      <MoreHorizontal className="h-4 w-4" />
    </button>
  );
}
