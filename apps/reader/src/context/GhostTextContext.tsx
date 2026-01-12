/**
 * GhostTextContext
 *
 * Provides ghost text state and actions across the editor.
 * Enables AI-powered inline suggestions in any part of the document.
 */

"use client";

import {
  type GhostTextState,
  type UseGhostTextStreamOptions,
  type UseGhostTextStreamReturn,
  useGhostTextStream,
} from "@/hooks/useGhostTextStream";
import { type ReactNode, createContext, useContext } from "react";

const GhostTextContext = createContext<UseGhostTextStreamReturn | null>(null);

export interface GhostTextProviderProps {
  children: ReactNode;
  options?: UseGhostTextStreamOptions;
}

/**
 * Provider for ghost text functionality.
 */
export function GhostTextProvider({
  children,
  options,
}: GhostTextProviderProps): React.ReactElement {
  const ghostText = useGhostTextStream(options);

  return <GhostTextContext.Provider value={ghostText}>{children}</GhostTextContext.Provider>;
}

/**
 * Hook to access ghost text context.
 */
export function useGhostText(): UseGhostTextStreamReturn {
  const context = useContext(GhostTextContext);
  if (!context) {
    throw new Error("useGhostText must be used within a GhostTextProvider");
  }
  return context;
}

/**
 * Hook to access ghost text state only (no actions).
 * Use for read-only consumers like the GhostText display component.
 */
export function useGhostTextState(): GhostTextState {
  const context = useContext(GhostTextContext);
  if (!context) {
    return { text: "", visible: false, isStreaming: false };
  }
  return context.state;
}
