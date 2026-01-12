/**
 * GhostText Component
 *
 * Renders inline AI suggestions as translucent ghost text.
 * Supports streaming display, partial acceptance, and keyboard navigation.
 */

"use client";

import { cn } from "@/lib/utils";
import { useEffect, useRef, useState } from "react";
import type * as React from "react";

/** Ghost text props */
export interface GhostTextProps {
  /** Suggestion text to display */
  text: string;
  /** Whether ghost text is visible */
  visible: boolean;
  /** Whether suggestion is loading/streaming */
  isStreaming?: boolean;
  /** Position relative to cursor (in pixels) */
  position?: { x: number; y: number };
  /** Callback when user accepts (Tab) */
  onAccept?: () => void;
  /** Callback when user accepts word (Ctrl+Right) */
  onAcceptWord?: () => void;
  /** Callback when user accepts line (Ctrl+End) */
  onAcceptLine?: () => void;
  /** Callback when user rejects (Escape) */
  onReject?: () => void;
  /** Additional CSS classes */
  className?: string;
  /** Animation duration in ms */
  animationDuration?: number;
}

/** Ghost text display state */
type DisplayState = "hidden" | "entering" | "visible" | "exiting";

/**
 * GhostText component for inline AI suggestions.
 */
export function GhostText({
  text,
  visible,
  isStreaming = false,
  position,
  onAccept,
  onAcceptWord,
  onAcceptLine,
  onReject,
  className,
  animationDuration = 150,
}: GhostTextProps): React.ReactElement | null {
  const [displayState, setDisplayState] = useState<DisplayState>("hidden");
  const [displayText, setDisplayText] = useState("");
  const containerRef = useRef<HTMLSpanElement>(null);

  // Handle visibility changes with animation
  useEffect(() => {
    if (visible && text) {
      setDisplayState("entering");
      setDisplayText(text);
      const timer = setTimeout(() => setDisplayState("visible"), 10);
      return () => clearTimeout(timer);
    }
    if (!visible && displayState !== "hidden") {
      setDisplayState("exiting");
      const timer = setTimeout(() => {
        setDisplayState("hidden");
        setDisplayText("");
      }, animationDuration);
      return () => clearTimeout(timer);
    }
  }, [visible, text, animationDuration, displayState]);

  // Update text during streaming
  useEffect(() => {
    if (isStreaming && visible) {
      setDisplayText(text);
    }
  }, [text, isStreaming, visible]);

  // Handle keyboard events
  useEffect(() => {
    if (!visible) {
      return;
    }

    // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: keyboard handling covers acceptance, navigation, and cancellation paths
    const handleKeyDown = (event: KeyboardEvent) => {
      // Tab to accept full suggestion
      if (event.key === "Tab" && !event.shiftKey) {
        event.preventDefault();
        onAccept?.();
        return;
      }

      // Escape to reject
      if (event.key === "Escape") {
        event.preventDefault();
        onReject?.();
        return;
      }

      // Ctrl+Right to accept next word
      if (event.key === "ArrowRight" && event.ctrlKey) {
        event.preventDefault();
        onAcceptWord?.();
        return;
      }

      // Ctrl+End to accept line
      if (event.key === "End" && event.ctrlKey) {
        event.preventDefault();
        onAcceptLine?.();
        return;
      }

      // Any other typing rejects the suggestion
      if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
        onReject?.();
      }
    };

    window.addEventListener("keydown", handleKeyDown, { capture: true });
    return () => window.removeEventListener("keydown", handleKeyDown, { capture: true });
  }, [visible, onAccept, onAcceptWord, onAcceptLine, onReject]);

  if (displayState === "hidden" || !displayText) {
    return null;
  }

  const style: React.CSSProperties = position
    ? {
        position: "absolute",
        left: position.x,
        top: position.y,
      }
    : {};

  return (
    <span
      ref={containerRef}
      className={cn(
        "ghost-text pointer-events-none select-none",
        "text-muted-foreground/50",
        "transition-opacity",
        displayState === "entering" && "opacity-0",
        displayState === "visible" && "opacity-100",
        displayState === "exiting" && "opacity-0",
        isStreaming && "ghost-text-streaming",
        className
      )}
      style={{
        ...style,
        transitionDuration: `${animationDuration}ms`,
      }}
      aria-hidden="true"
      data-testid="ghost-text"
    >
      {displayText}
      {isStreaming && <span className="ghost-text-cursor animate-pulse">▌</span>}
    </span>
  );
}

/**
 * GhostTextOverlay - Positioned overlay for ghost text.
 * Use when ghost text needs to be rendered outside the editor DOM.
 */
export interface GhostTextOverlayProps extends Omit<GhostTextProps, "position"> {
  /** Anchor element to position relative to */
  anchorElement?: HTMLElement | null;
  /** Offset from anchor */
  offset?: { x: number; y: number };
}

export function GhostTextOverlay({
  anchorElement,
  offset = { x: 0, y: 0 },
  ...props
}: GhostTextOverlayProps): React.ReactElement | null {
  const [position, setPosition] = useState<{ x: number; y: number } | undefined>();

  useEffect(() => {
    if (!anchorElement || !props.visible) {
      setPosition(undefined);
      return;
    }

    const updatePosition = () => {
      const rect = anchorElement.getBoundingClientRect();
      setPosition({
        x: rect.right + offset.x,
        y: rect.top + offset.y,
      });
    };

    updatePosition();

    // Update on scroll/resize
    const observer = new ResizeObserver(updatePosition);
    observer.observe(anchorElement);

    window.addEventListener("scroll", updatePosition, { passive: true });
    window.addEventListener("resize", updatePosition, { passive: true });

    return () => {
      observer.disconnect();
      window.removeEventListener("scroll", updatePosition);
      window.removeEventListener("resize", updatePosition);
    };
  }, [anchorElement, props.visible, offset.x, offset.y]);

  if (!position) {
    return <GhostText {...props} />;
  }

  return (
    <div className="fixed z-50 pointer-events-none" style={{ left: position.x, top: position.y }}>
      <GhostText {...props} />
    </div>
  );
}

/**
 * Extract first word from text.
 */
export function getFirstWord(text: string): string {
  const match = text.match(/^\S+/);
  return match ? match[0] : "";
}

/**
 * Extract first line from text.
 */
export function getFirstLine(text: string): string {
  const newlineIndex = text.indexOf("\n");
  return newlineIndex >= 0 ? text.slice(0, newlineIndex) : text;
}

/**
 * CSS styles for ghost text (add to global CSS)
 *
 * .ghost-text {
 *   font-family: inherit;
 *   font-size: inherit;
 *   line-height: inherit;
 *   white-space: pre-wrap;
 * }
 *
 * .ghost-text-streaming {
 *   animation: ghost-text-fade 0.3s ease-in-out;
 * }
 *
 * .ghost-text-cursor {
 *   opacity: 0.7;
 * }
 *
 * @keyframes ghost-text-fade {
 *   from { opacity: 0.3; }
 *   to { opacity: 0.5; }
 * }
 */
