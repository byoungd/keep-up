"use client";

import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";
import * as React from "react";

export interface ListRowProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** Unique value for selection */
  value: string;
  /** Primary label */
  label: string;
  /** Secondary description */
  description?: string;
  /** Icon component */
  icon?: LucideIcon;
  /** Keyboard shortcut display */
  shortcut?: string[];
  /** Whether this row is selected/active */
  selected?: boolean;
  /** Visual density: compact, default, comfortable */
  density?: "compact" | "default" | "comfortable";
  /** Internal: index passed from List */
  _index?: number;
}

const DENSITY_CLASSES = {
  compact: "py-1.5 px-2 text-xs",
  default: "py-2.5 px-3 text-sm",
  comfortable: "py-3.5 px-4 text-sm",
} as const;

/**
 * ListRow component for use within List.
 * Supports icons, descriptions, shortcuts, and density modes.
 */
export const ListRow = React.forwardRef<HTMLButtonElement, ListRowProps>(
  (
    {
      className,
      value,
      label,
      description,
      icon: Icon,
      shortcut,
      selected,
      disabled,
      density = "default",
      _index,
      ...props
    },
    ref
  ) => {
    return (
      <button
        ref={ref}
        type="button"
        // biome-ignore lint/a11y/useSemanticElements: Custom listbox button
        role="option"
        id={_index !== undefined ? `list-item-${_index}` : undefined}
        aria-selected={selected}
        data-state={selected ? "checked" : "unchecked"}
        data-disabled={disabled ? "" : undefined}
        data-value={value}
        className={cn(
          "flex items-center gap-3 w-full rounded-md outline-none transition-colors",
          "text-left text-foreground",
          "hover:bg-surface-2 focus-visible:bg-surface-2",
          "data-[selected=true]:bg-primary/10 data-[selected=true]:text-primary",
          "disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none",
          DENSITY_CLASSES[density],
          selected && "bg-primary/10 text-primary",
          className
        )}
        disabled={disabled}
        tabIndex={-1}
        {...props}
      >
        <div className="flex items-center gap-2 min-w-0">
          {Icon && (
            <span className="shrink-0 opacity-70">
              <Icon className={cn(density === "compact" ? "h-3.5 w-3.5" : "h-4 w-4")} />
            </span>
          )}
          <div className="flex flex-col items-start truncate text-left">
            <span className="font-medium truncate w-full">{label}</span>
            {description && (
              <span className="text-xs text-muted-foreground truncate w-full">{description}</span>
            )}
          </div>
        </div>
        {shortcut && shortcut.length > 0 && (
          <span className="flex items-center gap-1 shrink-0">
            {shortcut.map((key, i) => {
              return (
                <kbd
                  // biome-ignore lint/suspicious/noArrayIndexKey: Static shortcut data
                  key={`${value}-key-${i}`}
                  className="px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground bg-surface-2 rounded border border-border/30"
                >
                  {key}
                </kbd>
              );
            })}
          </span>
        )}
      </button>
    );
  }
);
ListRow.displayName = "ListRow";
