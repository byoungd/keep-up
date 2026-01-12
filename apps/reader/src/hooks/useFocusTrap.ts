/**
 * Custom hook to trap focus within a modal or dialog.
 * Note: Radix Dialog already provides focus trapping, but this is useful
 * for custom modals or overlays that need focus management.
 */

import { useCallback, useEffect, useRef } from "react";

const FOCUSABLE_SELECTORS = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(", ");

interface UseFocusTrapOptions {
  /** Whether the trap is active */
  active: boolean;
  /** Callback when Escape is pressed */
  onEscape?: () => void;
}

export function useFocusTrap<T extends HTMLElement>(options: UseFocusTrapOptions) {
  const { active, onEscape } = options;
  const containerRef = useRef<T>(null);
  const previousActiveElementRef = useRef<HTMLElement | null>(null);

  const getFocusableElements = useCallback((): HTMLElement[] => {
    if (!containerRef.current) {
      return [];
    }
    return Array.from(containerRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTORS));
  }, []);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!active || !containerRef.current) {
        return;
      }

      if (e.key === "Escape") {
        e.preventDefault();
        onEscape?.();
        return;
      }

      if (e.key !== "Tab") {
        return;
      }

      const focusableElements = getFocusableElements();
      if (focusableElements.length === 0) {
        e.preventDefault();
        return;
      }

      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];

      if (e.shiftKey && document.activeElement === firstElement) {
        e.preventDefault();
        lastElement.focus();
      } else if (!e.shiftKey && document.activeElement === lastElement) {
        e.preventDefault();
        firstElement.focus();
      }
    },
    [active, getFocusableElements, onEscape]
  );

  useEffect(() => {
    if (active) {
      // Store previously focused element
      previousActiveElementRef.current = document.activeElement as HTMLElement;

      // Focus first focusable element
      const timer = setTimeout(() => {
        const elements = getFocusableElements();
        elements[0]?.focus();
      }, 50);

      document.addEventListener("keydown", handleKeyDown);

      return () => {
        clearTimeout(timer);
        document.removeEventListener("keydown", handleKeyDown);
        // Restore focus to previous element
        previousActiveElementRef.current?.focus();
      };
    }
  }, [active, getFocusableElements, handleKeyDown]);

  return containerRef;
}
