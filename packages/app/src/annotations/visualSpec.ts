/**
 * LFCC v0.9 RC - State → Visual Spec (Design Tokens)
 * @see docs/product/LFCC_v0.9_RC_Parallel_Workstreams/02_UI_Annotation_Panel_and_UX.md Section B
 *
 * Maps LFCC states to UI styling.
 */

import type { AnnotationKind, AnnotationStatus } from "./types";

// ============================================================================
// Color Tokens
// ============================================================================

/** Status color tokens */
export const STATUS_COLORS = {
  active: {
    primary: "#fef08a", // Yellow highlight
    border: "#eab308", // Yellow border
    badge: "#ca8a04", // Yellow badge bg
    badgeText: "#ffffff", // Badge text
  },
  active_unverified: {
    primary: "#dbeafe", // Blue highlight (lighter)
    border: "#3b82f6", // Blue border
    badge: "#2563eb", // Blue badge bg
    badgeText: "#ffffff",
  },
  broken_grace: {
    primary: "#f3f4f6", // Gray highlight
    border: "#9ca3af", // Gray border (dashed)
    badge: "#6b7280", // Gray badge bg
    badgeText: "#ffffff",
  },
  active_partial: {
    primary: "#fef3c7", // Amber highlight
    border: "#f59e0b", // Amber border
    badge: "#d97706", // Amber badge bg
    badgeText: "#ffffff",
    gap: "#fee2e2", // Red for gaps
    gapBorder: "#ef4444",
  },
  orphan: {
    primary: "transparent", // No inline highlight
    border: "transparent",
    badge: "#dc2626", // Red badge bg
    badgeText: "#ffffff",
  },
} as const;

/** Kind color tokens */
export const KIND_COLORS = {
  highlight: "#fef08a",
  comment: "#dbeafe",
  suggestion: "#dcfce7",
  default: "#f3f4f6",
} as const;

// ============================================================================
// Style Tokens
// ============================================================================

/** Border style by status */
export const BORDER_STYLES: Record<AnnotationStatus, string> = {
  active: "solid",
  active_unverified: "dotted",
  broken_grace: "dashed",
  active_partial: "solid",
  orphan: "none",
};

/** Border width by status */
export const BORDER_WIDTHS: Record<AnnotationStatus, string> = {
  active: "2px",
  active_unverified: "2px",
  broken_grace: "1px",
  active_partial: "2px",
  orphan: "0",
};

/** Badge labels by status */
export const STATUS_LABELS: Record<AnnotationStatus, string> = {
  active: "Active",
  active_unverified: "Syncing",
  broken_grace: "Recovering",
  active_partial: "Partial",
  orphan: "Orphaned",
};

/** Badge icons (emoji or icon name) */
export const STATUS_ICONS: Record<AnnotationStatus, string> = {
  active: "✓",
  active_unverified: "↻",
  broken_grace: "⏳",
  active_partial: "◐",
  orphan: "⚠",
};

// ============================================================================
// Animation Policy
// ============================================================================

/** Animation durations (avoid flicker) */
export const ANIMATION = {
  /** Minimum time before showing loading state */
  loadingDelay: 200,
  /** Transition duration for state changes */
  stateTransition: 150,
  /** Debounce for rapid state changes */
  stateDebounce: 100,
  /** Grace timer pulse interval */
  gracePulse: 1000,
  /** Spin animation duration */
  spinDuration: 1000,
} as const;

// ============================================================================
// CSS Generation
// ============================================================================

/**
 * Get highlight style for annotation status
 */
export function getHighlightStyle(status: AnnotationStatus): {
  backgroundColor: string;
  borderColor: string;
  borderStyle: string;
  borderWidth: string;
} {
  const colors = STATUS_COLORS[status];
  return {
    backgroundColor: colors.primary,
    borderColor: colors.border,
    borderStyle: BORDER_STYLES[status],
    borderWidth: BORDER_WIDTHS[status],
  };
}

/**
 * Get badge style for annotation status
 */
export function getBadgeStyle(status: AnnotationStatus): {
  backgroundColor: string;
  color: string;
  label: string;
  icon: string;
} {
  const colors = STATUS_COLORS[status];
  return {
    backgroundColor: colors.badge,
    color: colors.badgeText,
    label: STATUS_LABELS[status],
    icon: STATUS_ICONS[status],
  };
}

/**
 * Get kind color
 */
export function getKindColor(kind: AnnotationKind): string {
  return KIND_COLORS[kind as keyof typeof KIND_COLORS] ?? KIND_COLORS.default;
}

/**
 * Generate CSS variables for annotation styling
 */
export function generateCssVariables(): string {
  const lines: string[] = [":root {"];

  // Status colors
  for (const [status, colors] of Object.entries(STATUS_COLORS)) {
    lines.push(`  --lfcc-${status}-primary: ${colors.primary};`);
    lines.push(`  --lfcc-${status}-border: ${colors.border};`);
    lines.push(`  --lfcc-${status}-badge: ${colors.badge};`);
    lines.push(`  --lfcc-${status}-badge-text: ${colors.badgeText};`);
  }

  // Kind colors
  for (const [kind, color] of Object.entries(KIND_COLORS)) {
    lines.push(`  --lfcc-kind-${kind}: ${color};`);
  }

  // Animation
  lines.push(`  --lfcc-loading-delay: ${ANIMATION.loadingDelay}ms;`);
  lines.push(`  --lfcc-state-transition: ${ANIMATION.stateTransition}ms;`);

  lines.push("}");
  return lines.join("\n");
}

/**
 * Generate CSS classes for annotation highlights
 */
export function generateHighlightCss(): string {
  const classes: string[] = [];

  for (const status of Object.keys(STATUS_COLORS) as AnnotationStatus[]) {
    const style = getHighlightStyle(status);
    classes.push(
      `
.lfcc-highlight--${status} {
  background-color: var(--lfcc-${status}-primary, ${style.backgroundColor});
  border-bottom: ${style.borderWidth} ${style.borderStyle} var(--lfcc-${status}-border, ${style.borderColor});
  transition: background-color var(--lfcc-state-transition, ${ANIMATION.stateTransition}ms) ease;
}
`.trim()
    );
  }

  // Gap marker for partial
  classes.push(
    `
.lfcc-highlight-gap {
  background-color: var(--lfcc-active_partial-gap, ${STATUS_COLORS.active_partial.gap});
  border-bottom: 1px dashed var(--lfcc-active_partial-gap-border, ${STATUS_COLORS.active_partial.gapBorder});
}
`.trim()
  );

  return classes.join("\n\n");
}

/**
 * Generate CSS classes for status badges
 */
export function generateBadgeCss(): string {
  const classes: string[] = [
    `
.lfcc-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  border-radius: 12px;
  font-size: 11px;
  font-weight: 500;
  white-space: nowrap;
}
`.trim(),
  ];

  for (const status of Object.keys(STATUS_COLORS) as AnnotationStatus[]) {
    const style = getBadgeStyle(status);
    classes.push(
      `
.lfcc-badge--${status} {
  background-color: var(--lfcc-${status}-badge, ${style.backgroundColor});
  color: var(--lfcc-${status}-badge-text, ${style.color});
}
`.trim()
    );
  }

  // Syncing animation for unverified
  classes.push(
    `
.lfcc-badge--active_unverified .lfcc-badge-icon {
  animation: lfcc-spin ${ANIMATION.spinDuration}ms linear infinite;
}

@keyframes lfcc-spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
`.trim()
  );

  // Pulse animation for grace
  classes.push(
    `
.lfcc-badge--broken_grace {
  animation: lfcc-pulse ${ANIMATION.gracePulse}ms ease-in-out infinite;
}

@keyframes lfcc-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.6; }
}
`.trim()
  );

  return classes.join("\n\n");
}

/**
 * Generate all CSS for annotation UI
 */
export function generateAllCss(): string {
  return [
    "/* LFCC Annotation UI Styles */",
    "/* Auto-generated from visualSpec.ts */",
    "",
    generateCssVariables(),
    "",
    generateHighlightCss(),
    "",
    generateBadgeCss(),
  ].join("\n");
}
