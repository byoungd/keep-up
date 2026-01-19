import * as React from "react";

interface SidebarLocalContextValue {
  isPeeking: boolean;
  onPin: () => void;
}

const SidebarLocalContext = React.createContext<SidebarLocalContextValue | null>(null);

export function useSidebarLocal() {
  const context = React.useContext(SidebarLocalContext);
  if (!context) {
    // Default fallback if used outside provider (e.g. tests)
    return { isPeeking: false, onPin: () => void 0 }; // logic handled by provider
  }
  return context;
}

export const SidebarLocalProvider = SidebarLocalContext.Provider;
