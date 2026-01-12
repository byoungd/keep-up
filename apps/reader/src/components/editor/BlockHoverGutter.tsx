"use client";

import { cn } from "@keepup/shared/utils";
import { GripVertical, Plus } from "lucide-react";

export type BlockHoverGutterProps = {
  /** Block ID for this gutter (for debugging) */
  blockId?: string;
  /** Show grab handle */
  showHandle?: boolean;
  /** Show insert button */
  showInsert?: boolean;
  /** Click handler for block menu (Notion: click grip → menu) */
  onBlockClick?: () => void;
  /** Drag start handler */
  onDragStart?: (e: React.DragEvent) => void;
  /** Insert button click handler */
  onInsertClick?: () => void;
  /** Menu button click handler (triggered by grip click) */
  onMenuClick?: (e: React.MouseEvent) => void;
  /** Pointer up handler for grip (ensures menu works when click is suppressed) */
  onHandlePointerUp?: (e: React.PointerEvent<HTMLButtonElement>) => void;
  /** Pointer down handler for grip (tracks click vs drag) */
  onHandlePointerDown?: (e: React.PointerEvent<HTMLButtonElement>) => void;
  /** Optional class name override */
  className?: string;
  /** Arbitrary props to spread onto the grip handle (for dnd-kit listeners/attributes) */
  handleProps?: Record<string, unknown>;
};

/**
 * Linear-style block hover gutter.
 *
 * Design:
 * - Minimalist: [+] [::]
 * - Plus: Insert below
 * - Grip: Drag to reorder, Click to open menu + select
 */
export function BlockHoverGutter({
  blockId,
  showHandle = true,
  showInsert = true,
  onBlockClick,
  onDragStart: _onDragStart,
  onInsertClick,
  onMenuClick,
  onHandlePointerUp,
  onHandlePointerDown,
  className,
  handleProps,
}: BlockHoverGutterProps) {
  const handleGripClick = (e: React.MouseEvent) => {
    // Linear behavior: Click selects block AND opens menu
    onBlockClick?.();
    onMenuClick?.(e);
  };

  const {
    onPointerDown: handlePointerDown,
    onPointerUp: handlePointerUp,
    ...restHandleProps
  } = (handleProps ?? {}) as Record<string, unknown>;

  const handleGripPointerDown = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (typeof handlePointerDown === "function") {
      (handlePointerDown as (e: React.PointerEvent<HTMLButtonElement>) => void)(event);
    }
    onHandlePointerDown?.(event);
  };

  const handleGripPointerUp = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (typeof handlePointerUp === "function") {
      (handlePointerUp as (e: React.PointerEvent<HTMLButtonElement>) => void)(event);
    }
    onHandlePointerUp?.(event);
  };

  return (
    <div
      className={cn(
        "flex items-center gap-1", // Increased gap slightly for better visual separation
        "transition-opacity duration-100",
        className
      )}
      data-block-id={blockId}
    >
      {showInsert && (
        <button
          type="button"
          onClick={onInsertClick}
          className={cn(
            "flex items-center justify-center",
            "h-6 w-6 rounded hover:bg-muted/60", // Slightly squarer, subtle hover
            "text-muted-foreground/50 hover:text-foreground", // More contrast on hover
            "transition-colors duration-150"
          )}
          aria-label="Add block"
        >
          <Plus className="h-4 w-4" strokeWidth={1.5} /> {/* Thinner stroke for elegance */}
        </button>
      )}

      {showHandle && (
        <button
          type="button"
          className={cn(
            "flex items-center justify-center",
            "h-6 w-6 rounded hover:bg-muted/60",
            "text-muted-foreground/50 hover:text-foreground",
            "transition-colors duration-150",
            "cursor-grab active:cursor-grabbing",
            "lfcc-block-drag-handle"
          )}
          onClick={handleGripClick}
          onPointerDown={handleGripPointerDown}
          onPointerUp={handleGripPointerUp}
          // Explicitly disable native HTML5 drag to prevent interference with dnd-kit
          // dnd-kit uses onPointerDown (in handleProps) instead of native drag
          draggable={false}
          aria-label="Drag to reorder or Click for menu"
          {...restHandleProps}
        >
          <GripVertical className="h-4 w-4" strokeWidth={1.5} />
        </button>
      )}
    </div>
  );
}

/**
 * Wrapper component to add block hover affordances to a block node.
 */
export function BlockWithGutter({
  children,
  blockId,
  className,
}: {
  children: React.ReactNode;
  blockId?: string;
  className?: string;
}) {
  return (
    <div className={cn("group relative", className)}>
      <BlockHoverGutter blockId={blockId} className="absolute -left-14 top-0" />
      {children}
    </div>
  );
}
