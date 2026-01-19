"use client";

import { cn } from "@ku0/shared/utils";
import { Search, X } from "lucide-react";
import * as React from "react";
import { Input, type InputProps } from "./Input";

export interface SearchInputProps extends Omit<InputProps, "leftIcon" | "type"> {
  /** Called when the clear button is clicked */
  onClear?: () => void;
  /** Show keyboard shortcut hint (e.g., "Cmd+K") */
  shortcutHint?: string;
}

/**
 * SearchInput - A specialized input with search icon, clear button, and optional shortcut hint.
 * Provides "Linear-quality" search experience.
 */
export const SearchInput = React.forwardRef<HTMLInputElement, SearchInputProps>(
  ({ className, value, onClear, shortcutHint, ...props }, ref) => {
    const hasValue = Boolean(value && String(value).length > 0);

    const handleClear = () => {
      if (onClear) {
        onClear();
      }
      // Restore focus to input
      if (ref && typeof ref !== "function") {
        ref.current?.focus();
      } else {
        // Fallback if forwarded ref is function or null - try to find input in this component
        // Note: This relies on the input being rendered.
        // A better approach if ref is not available is internal ref fallback,
        // but for now we assume consumers stick to standard object refs or we add internal ref.
      }
    };

    // Internal ref to ensure we can always focus
    const internalRef = React.useRef<HTMLInputElement>(null);
    React.useImperativeHandle(ref, () => internalRef.current as HTMLInputElement);

    React.useEffect(() => {
      if (!shortcutHint) {
        return;
      }

      const handleKeyDown = (e: KeyboardEvent) => {
        // Support Cmd+K or Ctrl+K
        if ((e.metaKey || e.ctrlKey) && e.key === "k") {
          e.preventDefault();
          internalRef.current?.focus();
        }
      };

      document.addEventListener("keydown", handleKeyDown);
      return () => document.removeEventListener("keydown", handleKeyDown);
    }, [shortcutHint]);

    return (
      <div className="relative">
        <Input
          ref={internalRef}
          type="search"
          value={value}
          leftIcon={<Search className="h-4 w-4" />}
          rightIcon={
            hasValue ? (
              <button
                type="button"
                onClick={handleClear}
                className="p-0.5 rounded hover:bg-muted transition-colors duration-fast focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label="Clear search"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            ) : shortcutHint ? (
              <kbd className="px-1.5 py-0.5 text-micro font-medium text-muted-foreground bg-surface-2 rounded border border-border/30">
                {shortcutHint}
              </kbd>
            ) : undefined
          }
          className={cn(
            "[&::-webkit-search-cancel-button]:hidden",
            "[&::-webkit-search-decoration]:hidden",
            className
          )}
          {...props}
        />
      </div>
    );
  }
);
SearchInput.displayName = "SearchInput";
