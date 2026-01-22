"use client";

import { cn } from "@ku0/shared/utils";
import type * as React from "react";
import { Button } from "../ui/Button";

export interface SuggestionsProps extends React.HTMLAttributes<HTMLDivElement> {}

export function Suggestions({ className, ...props }: SuggestionsProps) {
  return (
    <div
      className={cn(
        "flex items-center gap-2 overflow-x-auto whitespace-nowrap scrollbar-auto-hide",
        className
      )}
      {...props}
    />
  );
}

export interface SuggestionProps extends Omit<React.ComponentProps<typeof Button>, "onClick"> {
  suggestion: string;
  onClick?: (suggestion: string) => void;
}

export function Suggestion({
  suggestion,
  onClick,
  className,
  children,
  variant = "secondary",
  size = "sm",
  ...props
}: SuggestionProps) {
  return (
    <Button
      type="button"
      variant={variant}
      size={size}
      className={cn("whitespace-nowrap", className)}
      onClick={() => onClick?.(suggestion)}
      {...props}
    >
      {children ?? suggestion}
    </Button>
  );
}
