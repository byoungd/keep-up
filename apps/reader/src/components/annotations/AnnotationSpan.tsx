"use client";

import type { AnnotationColor } from "@/lib/kernel/types";
import { getAnnotationHighlightColor, getHighlightStyle } from "@keepup/app";
import { cn } from "@keepup/shared/utils";
import { StatusTooltip } from "./StatusTooltip";

interface AnnotationSpanProps {
  children: React.ReactNode;
  initialState?: "active" | "active_unverified" | "broken_grace" | "active_partial" | "orphan";
  // Mock positioning or just wrapping text
  className?: string;
  /** Whether this annotation is focused/selected */
  isFocused?: boolean;
  /** Callback when annotation is clicked */
  onClick?: () => void;
  /** Highlight color */
  color?: AnnotationColor;
}

export function AnnotationSpan({
  children,
  initialState = "active",
  className,
  color = "yellow",
  isFocused = false,
  onClick,
}: AnnotationSpanProps) {
  type AnnotationSpanStyle = {
    className: string;
    style?: React.CSSProperties;
  };

  // Base style with enhanced hover transitions
  const baseStyle = cn(
    "decoration-clone px-1 rounded-sm cursor-pointer select-text",
    // Smooth transitions for all interactive states
    "transition-all duration-150 ease-out",
    // Hover: subtle brightness lift and slight expansion
    "hover:brightness-105 hover:saturate-110",
    // Active press feedback
    "active:brightness-95 active:scale-[0.995]"
  );

  const activeHighlight = getHighlightStyle("active");
  const unverifiedHighlight = getHighlightStyle("active_unverified");
  const graceHighlight = getHighlightStyle("broken_grace");
  const partialHighlight = getHighlightStyle("active_partial");
  const activeColor = getAnnotationHighlightColor(color);
  const activeBorder = `${activeHighlight.borderWidth} ${activeHighlight.borderStyle} ${activeColor}`;
  const unverifiedBorder = `${unverifiedHighlight.borderWidth} ${unverifiedHighlight.borderStyle} ${activeColor}`;
  const partialBorder = `${partialHighlight.borderWidth} ${partialHighlight.borderStyle} ${activeColor}`;

  // Focused state ring for keyboard navigation
  const focusedStyle = isFocused
    ? "ring-2 ring-primary/50 ring-offset-1 ring-offset-background"
    : "";

  const styles: Record<
    NonNullable<AnnotationSpanProps["initialState"]> | "hidden" | "deleted",
    AnnotationSpanStyle
  > = {
    active: {
      className: cn(
        baseStyle,
        "text-foreground underline decoration-1 underline-offset-4",
        "box-decoration-clone",
        focusedStyle
      ),
      style: {
        backgroundColor: activeColor,
        borderBottom: activeBorder,
      },
    },
    active_unverified: {
      className: cn(
        "bg-transparent border-b-2 border-dotted animate-pulse cursor-wait px-0",
        baseStyle
      ),
      style: {
        backgroundColor: activeColor,
        borderBottom: unverifiedBorder,
      },
    },
    broken_grace: {
      className: cn("bg-transparent border-b-2 border-dashed cursor-warning px-0", baseStyle),
      style: {
        backgroundColor: graceHighlight.backgroundColor,
        borderBottom: `${graceHighlight.borderWidth} ${graceHighlight.borderStyle} ${graceHighlight.borderColor}`,
      },
    },
    active_partial: {
      className: cn(baseStyle, "text-foreground", focusedStyle),
      style: {
        backgroundColor: activeColor,
        borderBottom: partialBorder,
      },
    },
    orphan: {
      className:
        "text-muted-foreground line-through decoration-muted-foreground/60 opacity-60 bg-muted/40 dark:bg-muted/20 px-1 rounded-sm",
    },
    hidden: { className: "bg-transparent" },
    deleted: { className: "hidden" },
  };

  const visualState = initialState;

  // Handle click with keyboard accessibility
  const handleClick = onClick
    ? (e: React.MouseEvent) => {
        e.stopPropagation();
        onClick();
      }
    : undefined;

  const handleKeyDown = onClick
    ? (e: React.KeyboardEvent) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }
    : undefined;

  if (
    visualState === "active_unverified" ||
    visualState === "broken_grace" ||
    visualState === "active_partial"
  ) {
    return (
      <StatusTooltip state={visualState}>
        <span
          className={cn(styles[visualState].className, className)}
          style={styles[visualState].style}
        >
          {children}
        </span>
      </StatusTooltip>
    );
  }

  return (
    <span
      className={cn(styles[visualState].className, className)}
      style={styles[visualState].style}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      tabIndex={onClick ? 0 : undefined}
      role={onClick ? "button" : undefined}
    >
      {children}
    </span>
  );
}
