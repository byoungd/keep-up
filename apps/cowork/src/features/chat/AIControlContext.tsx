"use client";

import { createContext, type ReactNode, useContext, useState } from "react";

export type ContextPanelType = "project" | "packs" | "workflows" | "preflight" | null;

interface AIControlContextValue {
  /** Currently active context panel in the AI Panel */
  contextPanel: ContextPanelType;
  /** Set the active context panel */
  setContextPanel: (panel: ContextPanelType) => void;
  /** Close the context panel */
  closeContextPanel: () => void;
}

const AIControlContext = createContext<AIControlContextValue | null>(null);

export function useAIControl(): AIControlContextValue {
  const context = useContext(AIControlContext);
  if (!context) {
    throw new Error("useAIControl must be used within an AIControlProvider");
  }
  return context;
}

interface AIControlProviderProps {
  children: ReactNode;
}

export function AIControlProvider({ children }: AIControlProviderProps) {
  const [contextPanel, setContextPanel] = useState<ContextPanelType>(null);

  const closeContextPanel = () => setContextPanel(null);

  return (
    <AIControlContext.Provider
      value={{
        contextPanel,
        setContextPanel,
        closeContextPanel,
      }}
    >
      {children}
    </AIControlContext.Provider>
  );
}
