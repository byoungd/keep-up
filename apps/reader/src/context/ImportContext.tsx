"use client";

import type * as React from "react";
import { createContext, useCallback, useContext, useState } from "react";

interface ImportContextValue {
  isModalOpen: boolean;
  prefillUrl: string;
  prefillTab: string;
  openImportModal: (prefillUrl?: string, prefillTab?: string) => void;
  closeImportModal: () => void;
}

const ImportContext = createContext<ImportContextValue | null>(null);

export function useImportContext() {
  const ctx = useContext(ImportContext);
  if (!ctx) {
    throw new Error("useImportContext must be used within ImportProvider");
  }
  return ctx;
}

export function useImportContextOptional() {
  return useContext(ImportContext);
}

interface ImportProviderProps {
  children: React.ReactNode;
}

export function ImportProvider({ children }: ImportProviderProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [prefillUrl, setPrefillUrl] = useState("");
  const [prefillTab, setPrefillTab] = useState("url");

  const openImportModal = useCallback((url?: string, tab?: string) => {
    setPrefillUrl(url ?? "");
    setPrefillTab(tab ?? "url");
    setIsModalOpen(true);
  }, []);

  const closeImportModal = useCallback(() => {
    setIsModalOpen(false);
    setPrefillUrl("");
    setPrefillTab("url");
  }, []);

  const value: ImportContextValue = {
    isModalOpen,
    prefillUrl,
    prefillTab,
    openImportModal,
    closeImportModal,
  };

  return <ImportContext.Provider value={value}>{children}</ImportContext.Provider>;
}
