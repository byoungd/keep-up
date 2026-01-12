"use client";

import { ImportProvider } from "@/context/ImportContext";
import { GlobalImportHandler } from "./GlobalImportHandler";

interface ImportWrapperProps {
  children: React.ReactNode;
}

/**
 * Client-side wrapper that provides import context and global handlers.
 * Wrap your app content with this to enable global drag/drop and shortcuts.
 */
export function ImportWrapper({ children }: ImportWrapperProps) {
  return (
    <ImportProvider>
      {children}
      <GlobalImportHandler />
    </ImportProvider>
  );
}
