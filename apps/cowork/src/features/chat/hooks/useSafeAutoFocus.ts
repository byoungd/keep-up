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
  const modal = document.querySelector("[aria-modal='true']");
  if (modal) {
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
