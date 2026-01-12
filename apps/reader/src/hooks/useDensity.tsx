"use client";

import * as React from "react";

export type DensityMode = "compact" | "default" | "comfortable";

const STORAGE_KEY = "reader:density";

interface DensityContextValue {
  density: DensityMode;
  setDensity: (mode: DensityMode) => void;
}

const DensityContext = React.createContext<DensityContextValue | undefined>(undefined);

/**
 * DensityProvider applies `data-density` attribute to document root.
 * Should be placed near the top of the component tree (e.g., in RootLayout).
 */
export function DensityProvider({ children }: { children: React.ReactNode }) {
  const [density, setDensityState] = React.useState<DensityMode>("default");
  const [mounted, setMounted] = React.useState(false);

  // Load from localStorage on mount
  React.useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY) as DensityMode | null;
    if (stored && ["compact", "default", "comfortable"].includes(stored)) {
      setDensityState(stored);
    }
    setMounted(true);
  }, []);

  // Apply data attribute to document
  React.useEffect(() => {
    if (mounted) {
      document.documentElement.setAttribute("data-density", density);
    }
  }, [density, mounted]);

  const setDensity = React.useCallback((mode: DensityMode) => {
    setDensityState(mode);
    localStorage.setItem(STORAGE_KEY, mode);
  }, []);

  const value = React.useMemo(() => ({ density, setDensity }), [density, setDensity]);

  return <DensityContext.Provider value={value}>{children}</DensityContext.Provider>;
}

/**
 * Hook to access and modify the current density mode.
 */
export function useDensity(): DensityContextValue {
  const context = React.useContext(DensityContext);
  if (!context) {
    // Fallback for components outside DensityProvider
    return {
      density: "default",
      setDensity: () => {
        console.warn("useDensity: No DensityProvider found in tree.");
      },
    };
  }
  return context;
}
