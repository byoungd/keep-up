import type { Config } from "tailwindcss";

type ThemeExtend = NonNullable<Config["theme"]>["extend"];

export const sharedThemeExtend: ThemeExtend = {
  colors: {
    border: "var(--color-border)",
    input: "var(--color-input)",
    ring: "var(--color-ring)",
    background: "var(--color-background)",
    foreground: "var(--color-foreground)",

    /* Frame & Layout (v3) */
    theme: {
      DEFAULT: "var(--color-theme-base)",
    },
    sidebar: {
      DEFAULT: "var(--color-sidebar)",
    },
    canvas: {
      DEFAULT: "var(--color-canvas)",
    },

    primary: {
      DEFAULT: "var(--color-primary)",
      foreground: "var(--color-primary-foreground)",
    },
    secondary: {
      DEFAULT: "var(--color-secondary)",
      foreground: "var(--color-secondary-foreground)",
    },
    destructive: {
      DEFAULT: "var(--color-destructive)",
      foreground: "var(--color-destructive-foreground)",
    },
    success: {
      DEFAULT: "var(--color-success)",
      foreground: "var(--color-success-foreground)",
    },
    warning: {
      DEFAULT: "var(--color-warning)",
      foreground: "var(--color-warning-foreground)",
    },
    info: {
      DEFAULT: "var(--color-info)",
      foreground: "var(--color-info-foreground)",
    },
    error: {
      DEFAULT: "var(--color-error)",
      foreground: "var(--color-error-foreground)",
    },
    muted: {
      DEFAULT: "var(--color-muted)",
      foreground: "var(--color-muted-foreground)",
    },
    accent: {
      DEFAULT: "var(--color-accent)",
      foreground: "var(--color-accent-foreground)",
      amber: "var(--color-accent-amber)",
      emerald: "var(--color-accent-emerald)",
      violet: "var(--color-accent-violet)",
      indigo: "var(--color-accent-indigo)",
      cyan: "var(--color-accent-cyan)",
      rose: "var(--color-accent-rose)",
      ai: "var(--color-accent-ai)",
    },
    popover: {
      DEFAULT: "var(--color-popover)",
      foreground: "var(--color-popover-foreground)",
    },
    card: {
      DEFAULT: "var(--color-card)",
      foreground: "var(--color-card-foreground)",
    },
    surface: {
      0: "var(--color-surface-0)",
      1: "var(--color-surface-1)",
      2: "var(--color-surface-2)",
      3: "var(--color-surface-3)",
      elevated: "var(--color-surface-elevated)",
    },
  },
  borderRadius: {
    lg: "var(--radius-lg)",
    md: "var(--radius-md)",
    sm: "var(--radius-sm)",
    xl: "var(--radius-xl)",
    "2xl": "var(--radius-2xl)",
    "3xl": "var(--radius-3xl)",
    DEFAULT: "var(--radius)",
  },
  fontSize: {
    nano: ["var(--font-size-nano)", { lineHeight: "var(--line-height-nano)" }],
    tiny: ["var(--font-size-tiny)", { lineHeight: "var(--line-height-tiny)" }],
    micro: ["var(--font-size-micro)", { lineHeight: "var(--line-height-micro)" }],
    fine: ["var(--font-size-fine)", { lineHeight: "var(--line-height-fine)" }],
    chrome: ["var(--font-size-chrome)", { lineHeight: "var(--line-height-chrome)" }],
    content: ["var(--font-size-content)", { lineHeight: "var(--line-height-content)" }],
  },
  boxShadow: {
    soft: "var(--shadow-soft)",
  },
  transitionDuration: {
    fast: "var(--duration-fast)",
    normal: "var(--duration-normal)",
    slow: "var(--duration-slow)",
  },
  transitionTimingFunction: {
    spring: "var(--ease-spring)",
    smooth: "var(--ease-smooth)",
    "out-expo": "var(--ease-out-expo)",
    "in-out": "var(--ease-in-out)",
  },
  zIndex: {
    60: "60",
    100: "100",
    200: "200",
    300: "300",
    400: "400",
    500: "500",
    600: "600",
    1000: "1000",
    9999: "9999",
    overlay: "100",
    modal: "200",
    popover: "300",
    tooltip: "400",
    toast: "500",
    drag: "600",
  },
};
