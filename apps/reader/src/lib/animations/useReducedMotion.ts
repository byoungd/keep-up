/**
 * useReducedMotion Hook
 *
 * Respects user's motion preferences for accessibility.
 * When reduced motion is preferred, animations should be minimized or disabled.
 */

import { useEffect, useState } from "react";

const QUERY = "(prefers-reduced-motion: reduce)";

function getInitialState(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  return window.matchMedia(QUERY).matches;
}

/**
 * Hook to detect user's reduced motion preference.
 *
 * @returns `true` if user prefers reduced motion, `false` otherwise
 *
 * @example
 * ```tsx
 * const prefersReducedMotion = useReducedMotion();
 *
 * return (
 *   <motion.div
 *     animate={{ opacity: 1, y: prefersReducedMotion ? 0 : [10, 0] }}
 *     transition={prefersReducedMotion ? { duration: 0 } : springConfig.gentle}
 *   />
 * );
 * ```
 */
export function useReducedMotion(): boolean {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(getInitialState);

  useEffect(() => {
    const mediaQuery = window.matchMedia(QUERY);

    const handleChange = (event: MediaQueryListEvent) => {
      setPrefersReducedMotion(event.matches);
    };

    // Modern browsers
    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener("change", handleChange);
      return () => mediaQuery.removeEventListener("change", handleChange);
    }

    // Legacy browsers (Safari < 14)
    mediaQuery.addListener(handleChange);
    return () => mediaQuery.removeListener(handleChange);
  }, []);

  return prefersReducedMotion;
}

/**
 * Get animation props that respect reduced motion preference.
 *
 * @param prefersReducedMotion - Whether user prefers reduced motion
 * @returns Animation configuration object
 */
export function getMotionProps(prefersReducedMotion: boolean) {
  if (prefersReducedMotion) {
    return {
      initial: false,
      animate: undefined,
      exit: undefined,
      transition: { duration: 0 },
    };
  }
  return {};
}
