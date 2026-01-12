"use client";

import { cn } from "@/lib/utils";
import * as React from "react";

export interface ListProps extends Omit<React.HTMLAttributes<HTMLDivElement>, "onSelect"> {
  /** Render as menu (role="menu") or listbox (role="listbox") */
  variant?: "menu" | "listbox";
  /** Called when an item is selected via Enter or click */
  onSelect?: (value: string) => void;
  /** Currently selected/active value for controlled mode */
  value?: string;
  /** Enable keyboard navigation */
  enableKeyboardNav?: boolean;
}

// ----------------------------------------------------------------------------
// Internal Helpers
// ----------------------------------------------------------------------------

/**
 * Finds the nearest enabled item index in a given direction.
 */
const findNextEnabledIndex = (
  currentIndex: number,
  items: HTMLElement[],
  direction: 1 | -1
): number => {
  let next = currentIndex + direction;
  // Loop around logic
  if (next >= items.length) {
    next = 0;
  }
  if (next < 0) {
    next = items.length - 1;
  }

  // Safety break to prevent infinite loops if all items are disabled
  let attempts = 0;
  while (items[next]?.hasAttribute("data-disabled") && attempts < items.length) {
    next += direction;
    if (next >= items.length) {
      next = 0;
    }
    if (next < 0) {
      next = items.length - 1;
    }
    attempts++;
  }

  // If all disabled, return original
  return attempts === items.length ? currentIndex : next;
};

// ----------------------------------------------------------------------------
// Component
// ----------------------------------------------------------------------------

/**
 * Helper: determine next focus index based on key press.
 */
const getNextFocusIndex = (
  key: string,
  currentIndex: number,
  items: HTMLElement[],
  startSearch: (key: string, items: HTMLElement[]) => void
): number => {
  switch (key) {
    case "ArrowDown":
      return findNextEnabledIndex(currentIndex, items, 1);
    case "ArrowUp":
      return findNextEnabledIndex(currentIndex, items, -1);
    case "Home":
      return findNextEnabledIndex(-1, items, 1);
    case "End":
      return findNextEnabledIndex(items.length, items, -1);
    default:
      // Typeahead for printable characters
      if (key.length === 1) {
        startSearch(key, items);
      }
      return currentIndex;
  }
};

/** Check if key is a selection key */
const isSelectionKey = (key: string): boolean => key === "Enter" || key === " ";

/** Check if key has no modifiers */
const hasNoModifiers = (e: React.KeyboardEvent): boolean => !e.ctrlKey && !e.metaKey && !e.altKey;

/**
 * Generic List container with keyboard navigation support.
 *
 * Major Optimizations:
 * - Typeahead support (type to jump)
 * - ScrollIntoView (auto-scroll to focused item)
 * - Intelligent navigation (skips disabled items)
 */
export const List = React.forwardRef<HTMLDivElement, ListProps>(
  (
    {
      className,
      variant = "listbox",
      onSelect,
      value,
      enableKeyboardNav = true,
      children,
      ...props
    },
    ref
  ) => {
    const listRef = React.useRef<HTMLDivElement>(null);
    const [focusedIndex, setFocusedIndex] = React.useState(-1);

    // Typeahead state
    const typeaheadRef = React.useRef<string>("");
    const typeaheadTimerRef = React.useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

    // Get all items (memoized if children don't change structure often, but safe to query)
    const getItems = React.useCallback(() => {
      if (!listRef.current) {
        return [];
      }
      // We select ALL role items, then filter navigation logic
      return Array.from(
        listRef.current.querySelectorAll<HTMLElement>('[role="option"], [role="menuitem"]')
      );
    }, []);

    // Scroll active item into view
    React.useEffect(() => {
      if (focusedIndex >= 0) {
        const items = getItems();
        const item = items[focusedIndex];
        if (item) {
          item.scrollIntoView({ block: "nearest", behavior: "smooth" });
        }
      }
    }, [focusedIndex, getItems]);

    // Handle Typeahead
    const handleTypeahead = React.useCallback(
      (key: string, items: HTMLElement[]) => {
        if (key.length !== 1) {
          return;
        }

        // Clear existing timer
        if (typeaheadTimerRef.current) {
          clearTimeout(typeaheadTimerRef.current);
        }

        // Apprend to query
        typeaheadRef.current += key.toLowerCase();

        // Reset query after 500ms
        typeaheadTimerRef.current = setTimeout(() => {
          typeaheadRef.current = "";
        }, 500);

        // Find match
        const query = typeaheadRef.current;
        // Start search from next item after focus, wrapping around
        const searchOrder = [...items.slice(focusedIndex + 1), ...items.slice(0, focusedIndex + 1)];

        const match = searchOrder.find((item) => {
          if (item.hasAttribute("data-disabled")) {
            return false;
          }
          const text = item.textContent?.trim().toLowerCase() || "";
          return text.startsWith(query);
        });

        if (match) {
          // Find original index
          const index = items.indexOf(match);
          if (index !== -1) {
            setFocusedIndex(index);
            match.focus();
          }
        }
      },
      [focusedIndex]
    );

    const handleSelection = React.useCallback(
      (e: React.KeyboardEvent, items: HTMLElement[]) => {
        e.preventDefault();
        if (focusedIndex >= 0 && items[focusedIndex]) {
          if (items[focusedIndex].hasAttribute("data-disabled")) {
            return;
          }
          const itemValue = items[focusedIndex].getAttribute("data-value");
          if (itemValue && onSelect) {
            onSelect(itemValue);
          }
        }
      },
      [focusedIndex, onSelect]
    );

    const handleKeyDown = React.useCallback(
      (e: React.KeyboardEvent<HTMLDivElement>) => {
        if (!enableKeyboardNav) {
          return;
        }

        const items = getItems();
        if (items.length === 0) {
          return;
        }

        // Selection
        if (isSelectionKey(e.key)) {
          if (items[focusedIndex]?.tagName !== "A") {
            e.preventDefault();
          }
          handleSelection(e, items);
          return;
        }

        // Navigation (only without modifiers)
        if (hasNoModifiers(e)) {
          const nextIndex = getNextFocusIndex(e.key, focusedIndex, items, (k, i) =>
            handleTypeahead(k, i)
          );

          if (nextIndex !== focusedIndex) {
            e.preventDefault();
            setFocusedIndex(nextIndex);
            items[nextIndex]?.focus();
          }
        }
      },
      [enableKeyboardNav, focusedIndex, getItems, handleSelection, handleTypeahead]
    );

    // Merge refs
    React.useImperativeHandle(ref, () => listRef.current as HTMLDivElement);

    return (
      <div
        ref={listRef}
        role={variant === "menu" ? "menu" : "listbox"}
        aria-activedescendant={focusedIndex >= 0 ? `list-item-${focusedIndex}` : undefined}
        tabIndex={0}
        className={cn(
          "flex flex-col gap-0.5 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-lg",
          className
        )}
        onKeyDown={handleKeyDown}
        {...props}
      >
        {React.Children.map(children, (child, index) =>
          React.isValidElement(child)
            ? React.cloneElement(child as React.ReactElement<{ _index?: number }>, {
                _index: index,
              })
            : child
        )}
      </div>
    );
  }
);
List.displayName = "List";
