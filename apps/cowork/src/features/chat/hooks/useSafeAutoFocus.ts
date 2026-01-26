import type { DependencyList, RefObject } from "react";
import { useEffect } from "react";

function isFocusableElement(element: Element | null) {
  if (!element) {
    return false;
  }
  const tag = element.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") {
    return true;
  }
  if (element instanceof HTMLElement && element.isContentEditable) {
    return true;
  }
  return false;
}

function shouldAutoFocus() {
  if (typeof document === "undefined") {
    return false;
  }
  const hasDialogElement = typeof HTMLDialogElement !== "undefined";
  const modals = document.querySelectorAll("[aria-modal='true']");
  for (const modal of modals) {
    if (hasDialogElement && modal instanceof HTMLDialogElement) {
      if (!modal.open) {
        continue;
      }
      return false;
    }
    if (modal instanceof HTMLElement && modal.getClientRects().length === 0) {
      continue;
    }
    return false;
  }
  const active = document.activeElement;
  if (!active || active === document.body || active === document.documentElement) {
    return true;
  }
  if (isFocusableElement(active)) {
    return false;
  }
  return false;
}

export function useSafeAutoFocus<T extends HTMLElement>(
  ref: RefObject<T | null>,
  deps: DependencyList = [],
  enabled = true
) {
  useEffect(() => {
    if (!enabled) {
      return;
    }
    if (!shouldAutoFocus()) {
      return;
    }
    const raf = requestAnimationFrame(() => {
      ref.current?.focus();
    });
    return () => cancelAnimationFrame(raf);
    // biome-ignore lint/correctness/useExhaustiveDependencies: caller controls dependencies
  }, deps);
}
