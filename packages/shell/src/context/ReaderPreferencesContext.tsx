"use client";

import * as React from "react";

const STORAGE_KEY = "reader-preferences";

const FONT_FAMILIES = ["serif", "sans"] as const;
const CANVAS_TONES = ["default", "warm", "mint", "sepia", "dark"] as const;

export type ReaderFontFamily = (typeof FONT_FAMILIES)[number];
export type ReaderCanvasTone = (typeof CANVAS_TONES)[number];

export interface ReaderPreferences {
  fontSize: number;
  lineHeight: number;
  fontFamily: ReaderFontFamily;
  canvas: ReaderCanvasTone;
}

interface ReaderPreferencesContextValue {
  preferences: ReaderPreferences;
  setFontSize: (value: number) => void;
  setLineHeight: (value: number) => void;
  setFontFamily: (value: ReaderFontFamily) => void;
  setCanvas: (value: ReaderCanvasTone) => void;
  reset: () => void;
}

const DEFAULT_PREFERENCES: ReaderPreferences = {
  fontSize: 18,
  lineHeight: 1.75,
  fontFamily: "serif",
  canvas: "default",
};

const CANVAS_MAP: Record<ReaderCanvasTone, string> = {
  default: "var(--color-background)",
  warm: "var(--color-canvas-warm)",
  mint: "var(--color-canvas-mint)",
  sepia: "var(--color-canvas-sepia)",
  dark: "var(--color-canvas-dark)",
};

const ReaderPreferencesContext = React.createContext<ReaderPreferencesContextValue | null>(null);

const clampNumber = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

const isFontFamily = (value: unknown): value is ReaderFontFamily =>
  FONT_FAMILIES.includes(value as ReaderFontFamily);

const isCanvasTone = (value: unknown): value is ReaderCanvasTone =>
  CANVAS_TONES.includes(value as ReaderCanvasTone);

const toFiniteNumber = (value: unknown, fallback: number) => {
  const numeric = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
};

const normalizePreferences = (raw: unknown): ReaderPreferences => {
  if (!raw || typeof raw !== "object") {
    return DEFAULT_PREFERENCES;
  }

  const data = raw as Record<string, unknown>;
  const fontSize = clampNumber(toFiniteNumber(data.fontSize, DEFAULT_PREFERENCES.fontSize), 12, 32);
  const lineHeight = clampNumber(
    toFiniteNumber(data.lineHeight, DEFAULT_PREFERENCES.lineHeight),
    1.0,
    2.5
  );

  return {
    fontSize,
    lineHeight,
    fontFamily: isFontFamily(data.fontFamily) ? data.fontFamily : DEFAULT_PREFERENCES.fontFamily,
    canvas: isCanvasTone(data.canvas) ? data.canvas : DEFAULT_PREFERENCES.canvas,
  };
};

const applyPreferences = (preferences: ReaderPreferences) => {
  if (typeof document === "undefined") {
    return;
  }

  const root = document.documentElement;
  root.style.setProperty("--reader-font-size", `${preferences.fontSize}px`);
  root.style.setProperty("--reader-line-height", preferences.lineHeight.toString());
  root.style.setProperty(
    "--reader-font-family",
    preferences.fontFamily === "serif" ? "var(--font-serif)" : "var(--font-sans)"
  );
  root.style.setProperty("--reader-canvas", CANVAS_MAP[preferences.canvas]);
};

import { ThemeProvider } from "next-themes";

// ...

export function ReaderPreferencesProvider({
  children,
}: {
  children: React.ReactNode;
}): React.ReactElement {
  const [preferences, setPreferences] = React.useState<ReaderPreferences>(DEFAULT_PREFERENCES);
  const [isReady, setIsReady] = React.useState(false);

  React.useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        setPreferences(normalizePreferences(JSON.parse(stored) as unknown));
      } catch {
        localStorage.removeItem(STORAGE_KEY);
      }
    }
    setIsReady(true);
  }, []);

  React.useEffect(() => {
    applyPreferences(preferences);
    if (isReady) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
    }
  }, [preferences, isReady]);

  const value = React.useMemo<ReaderPreferencesContextValue>(
    () => ({
      preferences,
      setFontSize: (value) =>
        setPreferences((prev) => ({ ...prev, fontSize: clampNumber(value, 12, 32) })),
      setLineHeight: (value) =>
        setPreferences((prev) => ({ ...prev, lineHeight: clampNumber(value, 1.0, 2.5) })),
      setFontFamily: (value) => setPreferences((prev) => ({ ...prev, fontFamily: value })),
      setCanvas: (value) => setPreferences((prev) => ({ ...prev, canvas: value })),
      reset: () => setPreferences(DEFAULT_PREFERENCES),
    }),
    [preferences]
  );

  return (
    <ReaderPreferencesContext.Provider value={value}>
      <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
        {children}
      </ThemeProvider>
    </ReaderPreferencesContext.Provider>
  );
}

export function useReaderPreferences(): ReaderPreferencesContextValue {
  const context = React.useContext(ReaderPreferencesContext);
  if (!context) {
    throw new Error("useReaderPreferences must be used within ReaderPreferencesProvider");
  }
  return context;
}
