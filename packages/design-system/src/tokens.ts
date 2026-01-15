/**
 * Design System Tokens
 *
 * Semantic design tokens for consistent styling across the application.
 * These are TypeScript-first tokens that can be used in components and styles.
 */

// =============================================================================
// Spacing Scale (based on 4px grid)
// =============================================================================
export const spacing = {
  0: "0",
  px: "1px",
  0.5: "0.125rem", // 2px
  1: "0.25rem", // 4px
  1.5: "0.375rem", // 6px
  2: "0.5rem", // 8px
  2.5: "0.625rem", // 10px
  3: "0.75rem", // 12px
  3.5: "0.875rem", // 14px
  4: "1rem", // 16px
  5: "1.25rem", // 20px
  6: "1.5rem", // 24px
  7: "1.75rem", // 28px
  8: "2rem", // 32px
  9: "2.25rem", // 36px
  10: "2.5rem", // 40px
  11: "2.75rem", // 44px
  12: "3rem", // 48px
  14: "3.5rem", // 56px
  16: "4rem", // 64px
  32: "5rem", // 80px
  24: "6rem", // 96px
} as const;

// =============================================================================
// Typography Scale
// =============================================================================
export const fontSize = {
  xs: ["0.75rem", { lineHeight: "1rem" }], // 12px
  sm: ["0.875rem", { lineHeight: "1.25rem" }], // 14px
  base: ["1rem", { lineHeight: "1.5rem" }], // 16px
  lg: ["1.125rem", { lineHeight: "1.75rem" }], // 18px
  xl: ["1.25rem", { lineHeight: "1.75rem" }], // 20px
  "2xl": ["1.5rem", { lineHeight: "2rem" }], // 24px
  "3xl": ["1.875rem", { lineHeight: "2.25rem" }], // 30px
  "4xl": ["2.25rem", { lineHeight: "2.5rem" }], // 36px
} as const;

export const fontWeight = {
  normal: "400",
  medium: "500",
  semibold: "600",
  bold: "700",
} as const;

// =============================================================================
// Border Radius
// =============================================================================
export const borderRadius = {
  none: "0",
  sm: "0.25rem", // 4px
  DEFAULT: "0.375rem", // 6px
  md: "0.5rem", // 8px
  lg: "0.75rem", // 12px
  xl: "1rem", // 16px
  "2xl": "1.5rem", // 24px
  full: "9999px",
} as const;

// =============================================================================
// Shadows
// =============================================================================
export const boxShadow = {
  xs: "0 1px 2px 0 rgb(0 0 0 / 0.05)",
  sm: "0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)",
  DEFAULT: "0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)",
  md: "0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)",
  lg: "0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)",
  xl: "0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)",
  none: "none",
} as const;

// =============================================================================
// Transition Durations
// =============================================================================
export const transitionDuration = {
  fast: "100ms",
  normal: "200ms",
  DEFAULT: "200ms",
  slow: "300ms",
  slower: "500ms",
} as const;

// =============================================================================
// Z-Index Scale
// =============================================================================
export const zIndex = {
  0: "0",
  10: "10",
  20: "20",
  30: "30",
  40: "40",
  50: "50",
  60: "60",
  overlay: "100",
  modal: "200",
  popover: "300",
  tooltip: "400",
  toast: "500",
  drag: "600",
} as const;

// =============================================================================
// Component Size Presets
// =============================================================================
export const componentSizes = {
  button: {
    xs: "h-6 px-2 text-xs",
    sm: "h-8 px-3 text-xs",
    md: "h-9 px-4 text-sm",
    lg: "h-11 px-6 text-base",
  },
  input: {
    sm: "h-8 text-xs",
    md: "h-9 text-sm",
    lg: "h-11 text-base",
  },
  icon: {
    xs: "h-3 w-3",
    sm: "h-4 w-4",
    md: "h-5 w-5",
    lg: "h-6 w-6",
  },
} as const;

// =============================================================================
// Semantic Color Aliases (for documentation / reference)
// Actual colors are defined in CSS variables in globals.css
// =============================================================================
export const semanticColors = {
  // Core
  background: "var(--color-background)",
  foreground: "var(--color-foreground)",
  card: "var(--color-card)",
  cardForeground: "var(--color-card-foreground)",
  popover: "var(--color-popover)",
  popoverForeground: "var(--color-popover-foreground)",

  // Brand + emphasis
  primary: "var(--color-primary)",
  primaryForeground: "var(--color-primary-foreground)",
  secondary: "var(--color-secondary)",
  secondaryForeground: "var(--color-secondary-foreground)",
  accent: "var(--color-accent)",
  accentForeground: "var(--color-accent-foreground)",

  // Semantic status
  success: "var(--color-success)",
  successForeground: "var(--color-success-foreground)",
  warning: "var(--color-warning)",
  warningForeground: "var(--color-warning-foreground)",
  info: "var(--color-info)",
  infoForeground: "var(--color-info-foreground)",
  error: "var(--color-error)",
  errorForeground: "var(--color-error-foreground)",
  destructive: "var(--color-destructive)",
  destructiveForeground: "var(--color-destructive-foreground)",
  muted: "var(--color-muted)",
  mutedForeground: "var(--color-muted-foreground)",

  // Surfaces
  surface0: "var(--color-surface-0)",
  surface1: "var(--color-surface-1)",
  surface2: "var(--color-surface-2)",
  surface3: "var(--color-surface-3)",
  surfaceElevated: "var(--color-surface-elevated)",

  // Borders
  border: "var(--color-border)",
  input: "var(--color-input)",
  ring: "var(--color-ring)",

  // Accent palette
  accentAmber: "var(--color-accent-amber)",
  accentEmerald: "var(--color-accent-emerald)",
  accentViolet: "var(--color-accent-violet)",
  accentIndigo: "var(--color-accent-indigo)",
  accentCyan: "var(--color-accent-cyan)",
  accentRose: "var(--color-accent-rose)",
  accentIndigoGlow: "var(--color-accent-indigo-glow)",

  // Highlights
  highlightYellow: "var(--color-highlight-yellow)",
  highlightGreen: "var(--color-highlight-green)",
  highlightRed: "var(--color-highlight-red)",
  highlightPurple: "var(--color-highlight-purple)",

  // Canvas tones
  canvasWarm: "var(--color-canvas-warm)",
  canvasMint: "var(--color-canvas-mint)",
  canvasSepia: "var(--color-canvas-sepia)",
  canvasDark: "var(--color-canvas-dark)",

  // Ambient gradients
  ambientPaper: "var(--color-ambient-paper)",
  ambientEmerald: "var(--color-ambient-emerald)",
  ambientBlue: "var(--color-ambient-blue)",

  // Presence
  presence1: "var(--color-presence-1)",
  presence2: "var(--color-presence-2)",
  presence3: "var(--color-presence-3)",
  presence4: "var(--color-presence-4)",
  presence5: "var(--color-presence-5)",
  presence6: "var(--color-presence-6)",
  presence7: "var(--color-presence-7)",
  presence8: "var(--color-presence-8)",
  presence9: "var(--color-presence-9)",
} as const;

// =============================================================================
// Type Exports
// =============================================================================
export type Spacing = keyof typeof spacing;
export type FontSize = keyof typeof fontSize;
export type FontWeight = keyof typeof fontWeight;
export type BorderRadius = keyof typeof borderRadius;
export type BoxShadow = keyof typeof boxShadow;
export type ZIndex = keyof typeof zIndex;
