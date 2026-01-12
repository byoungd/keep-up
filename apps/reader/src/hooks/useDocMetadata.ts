"use client";

import * as React from "react";

import type { DocMetadata, DocSourceType } from "@/lib/persistence/docMetadata";
import { docPersistence } from "@/lib/persistence/docPersistence";

export interface UseDocMetadataOptions {
  /** Filter by source type */
  sourceType?: DocSourceType;
  /** Enable auto-refresh when documents change */
  autoRefresh?: boolean;
}

export interface UseDocMetadataResult {
  /** All metadata entries (optionally filtered by sourceType) */
  metadata: DocMetadata[];
  /** Loading state */
  isLoading: boolean;
  /** Error state */
  error: Error | null;
  /** Refresh the metadata list */
  refresh: () => Promise<void>;
  /** Get metadata for a specific document */
  getMetadata: (id: string) => Promise<DocMetadata | null>;
  /** Save or update metadata */
  saveMetadata: (metadata: DocMetadata) => Promise<void>;
  /** Delete metadata */
  deleteMetadata: (id: string) => Promise<void>;
}

/**
 * Hook to manage document metadata.
 * Provides CRUD operations and filtered lists.
 */
export function useDocMetadata(options: UseDocMetadataOptions = {}): UseDocMetadataResult {
  const { sourceType, autoRefresh = false } = options;

  const [metadata, setMetadata] = React.useState<DocMetadata[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<Error | null>(null);

  const refresh = React.useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = sourceType
        ? await docPersistence.getMetadataBySource(sourceType)
        : await docPersistence.getAllMetadata();
      setMetadata(data);
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setIsLoading(false);
    }
  }, [sourceType]);

  const getMetadata = React.useCallback(async (id: string) => {
    return docPersistence.loadMetadata(id);
  }, []);

  const saveMetadata = React.useCallback(
    async (meta: DocMetadata) => {
      await docPersistence.saveMetadata(meta);
      if (autoRefresh) {
        await refresh();
      }
    },
    [autoRefresh, refresh]
  );

  const deleteMetadata = React.useCallback(
    async (id: string) => {
      await docPersistence.deleteMetadata(id);
      if (autoRefresh) {
        await refresh();
      }
    },
    [autoRefresh, refresh]
  );

  // Initial load
  React.useEffect(() => {
    refresh();
  }, [refresh]);

  return {
    metadata,
    isLoading,
    error,
    refresh,
    getMetadata,
    saveMetadata,
    deleteMetadata,
  };
}
