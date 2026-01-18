/**
 * Cowork Motion System
 * Standardized physics and transitions for Framer Motion.
 */

// Spring Physics
export const springQuick = {
  type: "spring",
  stiffness: 500,
  damping: 30,
  mass: 0.5,
} as const;

export const springStandard = {
  type: "spring",
  stiffness: 300,
  damping: 30,
  mass: 1,
} as const;

export const springSlow = {
  type: "spring",
  stiffness: 180,
  damping: 30,
  mass: 1,
} as const;

export const springBouncy = {
  type: "spring",
  stiffness: 400,
  damping: 20,
  mass: 1,
} as const;

// Transition Presets
export const fadeScale = {
  initial: { opacity: 0, scale: 0.98 },
  animate: { opacity: 1, scale: 1 },
  exit: { opacity: 0, scale: 0.98 },
  transition: springStandard,
} as const;

export const slideUp = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: 10 },
  transition: springStandard,
} as const;

export const slideInRight = {
  initial: { opacity: 0, x: 20 },
  animate: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: 20 },
  transition: springStandard,
} as const;
