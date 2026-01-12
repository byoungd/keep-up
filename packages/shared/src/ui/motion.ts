/**
 * Shared Motion Constants for Top-Tier UI Feel.
 * Reference: docs/product/specs/engineering/User_Experience_Tier_1.md
 */

export const SPRINGS = {
  // Snappy, for small interactions (buttons, toggles)
  micro: { type: "spring" as const, stiffness: 500, damping: 30 },

  // Smooth, for layout changes (list reordering, panel open)
  layout: { type: "spring" as const, stiffness: 350, damping: 35 },

  // Heavy, for large page transitions
  page: { type: "spring" as const, stiffness: 200, damping: 25 },
} as const;

export const TRANSITIONS = {
  // Standard entry for popovers
  popover: {
    initial: { opacity: 0, scale: 0.95 },
    animate: { opacity: 1, scale: 1 },
    exit: { opacity: 0, scale: 0.95 },
    transition: { duration: 0.15, ease: [0.4, 0, 0.2, 1] },
  },
} as const;
