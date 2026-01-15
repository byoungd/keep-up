/**
 * Centralized animation variants for Framer Motion.
 * Use these for consistent animations across the app.
 */

import { transitionDuration } from "@ku0/design-system/tokens";
import type { Variants } from "framer-motion";

const toSeconds = (duration: string): number => {
  if (duration.endsWith("ms")) {
    return Number.parseFloat(duration) / 1000;
  }
  if (duration.endsWith("s")) {
    return Number.parseFloat(duration);
  }
  return Number.parseFloat(duration) / 1000;
};

const motionDurations = {
  fast: toSeconds(transitionDuration.fast),
  normal: toSeconds(transitionDuration.normal),
  slow: toSeconds(transitionDuration.slow),
};

export const fadeIn: Variants = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
};

export const fadeInUp: Variants = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -10 },
};

export const fadeInDown: Variants = {
  initial: { opacity: 0, y: -10 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: 10 },
};

export const scaleIn: Variants = {
  initial: { opacity: 0, scale: 0.95 },
  animate: { opacity: 1, scale: 1 },
  exit: { opacity: 0, scale: 0.95 },
};

export const slideInFromLeft: Variants = {
  initial: { opacity: 0, x: -20 },
  animate: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: -20 },
};

export const slideInFromRight: Variants = {
  initial: { opacity: 0, x: 20 },
  animate: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: 20 },
};

export const staggerContainer: Variants = {
  animate: {
    transition: {
      staggerChildren: 0.05,
    },
  },
};

export const staggerItem: Variants = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
};

/**
 * Transition presets matching our design tokens.
 */
export const transitions = {
  fast: { duration: motionDurations.fast },
  normal: { duration: motionDurations.normal },
  slow: { duration: motionDurations.slow },
  spring: { type: "spring", stiffness: 300, damping: 25 },
  smooth: { ease: [0.4, 0, 0.2, 1] },
} as const;
