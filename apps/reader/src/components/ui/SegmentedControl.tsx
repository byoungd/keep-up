"use client";

import { cn } from "@ku0/shared/utils";
import * as React from "react";

export interface SegmentedControlItem {
  value: string;
  label?: React.ReactNode;
  icon?: React.ReactNode;
  disabled?: boolean;
}

interface SegmentedControlProps {
  items: SegmentedControlItem[];
  value: string;
  onValueChange: (value: string) => void;
  className?: string;
  size?: "sm" | "md";
  /** Accessible name for the control group */
  "aria-label"?: string;
  /** ID of element that labels this control group */
  "aria-labelledby"?: string;
}

/**
 * Accessible segmented control with keyboard navigation.
 *
 * Keyboard controls:
 * - Arrow Left/Up: Select previous option
 * - Arrow Right/Down: Select next option
 * - Home: Select first option
 * - End: Select last option
 */
export function SegmentedControl({
  items,
  value,
  onValueChange,
  className,
  size = "md",
  "aria-label": ariaLabel,
  "aria-labelledby": ariaLabelledBy,
}: SegmentedControlProps) {
  const groupId = React.useId();

  // Keyboard navigation for roving tabindex pattern
  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const enabledItems = items.filter((item) => !item.disabled);
    if (enabledItems.length === 0) {
      return;
    }

    const currentIndex = enabledItems.findIndex((item) => item.value === value);
    let nextIndex = currentIndex;

    switch (e.key) {
      case "ArrowRight":
      case "ArrowDown":
        e.preventDefault();
        nextIndex = (currentIndex + 1) % enabledItems.length;
        break;
      case "ArrowLeft":
      case "ArrowUp":
        e.preventDefault();
        nextIndex = (currentIndex - 1 + enabledItems.length) % enabledItems.length;
        break;
      case "Home":
        e.preventDefault();
        nextIndex = 0;
        break;
      case "End":
        e.preventDefault();
        nextIndex = enabledItems.length - 1;
        break;
      default:
        return;
    }

    if (nextIndex !== currentIndex && enabledItems[nextIndex]) {
      onValueChange(enabledItems[nextIndex].value);
    }
  };

  return (
    <div
      className={cn(
        "flex p-1 bg-surface-2/70 rounded-lg border border-border/60 relative isolate",
        className
      )}
      role="radiogroup"
      aria-label={ariaLabel}
      aria-labelledby={ariaLabelledBy}
      onKeyDown={handleKeyDown}
    >
      {items.map((item, index) => {
        const isSelected = item.value === value;
        const optionId = `${groupId}-option-${index}`;

        return (
          <button
            key={item.value}
            id={optionId}
            type="button"
            // biome-ignore lint/a11y/useSemanticElements: Custom radio behavior using button
            role="radio"
            aria-checked={isSelected}
            tabIndex={isSelected ? 0 : -1}
            onClick={() => !item.disabled && onValueChange(item.value)}
            disabled={item.disabled}
            className={cn(
              "flex-1 flex items-center justify-center gap-2 rounded-md font-medium transition-all duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background z-10",
              size === "sm" ? "px-2 py-1 text-xs" : "px-3 py-1.5 text-sm",
              isSelected
                ? "bg-surface-0 text-foreground shadow-sm ring-1 ring-border/10"
                : "text-muted-foreground hover:text-foreground hover:bg-surface-0/60",
              item.disabled && "opacity-50 cursor-not-allowed"
            )}
          >
            {item.icon && (
              <span className={cn("shrink-0", size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4")}>
                {item.icon}
              </span>
            )}
            {item.label && <span>{item.label}</span>}
          </button>
        );
      })}
    </div>
  );
}
