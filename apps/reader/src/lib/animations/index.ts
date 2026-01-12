/**
 * Animation Utility Library
 *
 * Shared animation configurations for consistent micro-interactions.
 * All animations are designed to maintain 60fps and respect reduced motion preferences.
 */

import type { Transition } from "framer-motion";

// ============================================================================
// Spring Configurations (Framer Motion)
// ============================================================================

export const springConfig = {
  /** Gentle spring for subtle movements */
  gentle: { type: "spring", stiffness: 300, damping: 30 } as const,
  /** Snappy spring for quick feedback */
  snappy: { type: "spring", stiffness: 500, damping: 35 } as const,
  /** Bouncy spring for playful emphasis */
  bouncy: { type: "spring", stiffness: 400, damping: 25 } as const,
  /** Stiff spring for immediate response */
  stiff: { type: "spring", stiffness: 600, damping: 40 } as const,
} satisfies Record<string, Transition>;

// ============================================================================
// Duration Presets (milliseconds)
// ============================================================================

export const durations = {
  /** Instant feedback (< 100ms perceived as immediate) */
  instant: 100,
  /** Fast transitions for micro-interactions */
  fast: 150,
  /** Normal transitions for standard UI changes */
  normal: 200,
  /** Slow transitions for emphasis or larger movements */
  slow: 300,
  /** Extended duration for complex animations */
  emphasis: 400,
} as const;

// ============================================================================
// Easing Functions (cubic-bezier arrays for Framer Motion)
// ============================================================================

export const easings = {
  /** Standard ease-out for exits and settling */
  easeOut: [0.0, 0.0, 0.2, 1] as const,
  /** Ease-in-out for symmetrical transitions */
  easeInOut: [0.4, 0.0, 0.2, 1] as const,
  /** Spring-like overshoot for playful entrances */
  spring: [0.175, 0.885, 0.32, 1.275] as const,
  /** Expo ease-out for snappy responses */
  expoOut: [0.16, 1, 0.3, 1] as const,
  /** Smooth deceleration */
  smooth: [0.4, 0, 0.2, 1] as const,
} as const;

// ============================================================================
// Preset Transitions
// ============================================================================

export const transitions = {
  /** Fade in/out */
  fade: {
    duration: durations.fast / 1000,
    ease: easings.easeOut,
  },
  /** Scale with fade */
  scale: {
    duration: durations.normal / 1000,
    ease: easings.spring,
  },
  /** Slide from bottom */
  slideUp: {
    duration: durations.normal / 1000,
    ease: easings.expoOut,
  },
  /** Quick micro-interaction */
  micro: {
    duration: durations.instant / 1000,
    ease: easings.easeOut,
  },
  /** Command palette open */
  paletteOpen: {
    duration: durations.fast / 1000,
    ease: easings.expoOut,
  },
  /** Command palette close (faster than open) */
  paletteClose: {
    duration: durations.instant / 1000,
    ease: easings.easeOut,
  },
} satisfies Record<string, Transition>;

// ============================================================================
// Animation Variants (Framer Motion)
// ============================================================================

export const fadeVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1 },
  exit: { opacity: 0 },
} as const;

export const scaleVariants = {
  hidden: { opacity: 0, scale: 0.96 },
  visible: { opacity: 1, scale: 1 },
  exit: { opacity: 0, scale: 0.96 },
} as const;

export const slideUpVariants = {
  hidden: { opacity: 0, y: 10 },
  visible: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -10 },
} as const;

export const pulseVariants = {
  idle: { scale: 1, opacity: 1 },
  pulse: {
    scale: [1, 1.1, 1],
    opacity: [1, 0.8, 1],
    transition: {
      duration: 2,
      repeat: Number.POSITIVE_INFINITY,
      ease: "easeInOut",
    },
  },
} as const;

export const breatheVariants = {
  idle: { scale: 1 },
  breathe: {
    scale: [1, 1.05, 1],
    transition: {
      duration: 2,
      repeat: Number.POSITIVE_INFINITY,
      ease: "easeInOut",
    },
  },
} as const;

export const shakeVariants = {
  idle: { x: 0 },
  shake: {
    x: [-2, 2, -2, 2, 0],
    transition: {
      duration: 0.4,
      ease: "easeInOut",
    },
  },
} as const;

// ============================================================================
// Stagger Configuration
// ============================================================================

export const staggerConfig = {
  /** Fast stagger for list items */
  fast: 0.03,
  /** Normal stagger for command palette items */
  normal: 0.05,
  /** Slow stagger for emphasis */
  slow: 0.08,
} as const;

// ============================================================================
// CSS Keyframe Animations (for non-Framer contexts)
// ============================================================================

export const cssAnimations = {
  /** Cursor blink for typing indicator */
  cursorBlink: `
    @keyframes cursor-blink {
      0%, 100% { opacity: 1; }
      50% { opacity: 0; }
    }
  `,
  /** Gentle pulse for sync status */
  gentlePulse: `
    @keyframes gentle-pulse {
      0%, 100% { transform: scale(1); opacity: 1; }
      50% { transform: scale(1.1); opacity: 0.8; }
    }
  `,
  /** Success pulse for completion feedback */
  successPulse: `
    @keyframes success-pulse {
      0% { transform: scale(1); }
      50% { transform: scale(1.3); }
      100% { transform: scale(1); }
    }
  `,
  /** Progress bar shrink */
  progressShrink: `
    @keyframes progress-shrink {
      from { transform: scaleX(1); }
      to { transform: scaleX(0); }
    }
  `,
} as const;
