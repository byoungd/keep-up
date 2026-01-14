/**
 * Hook for accessing saved (read later) documents from the database.
 */

import type { DocumentRow, ListDocumentsOptions } from "@ku0/db";
import { useCallback, useEffect, useState } from "react";
import { getDbClient } from "../lib/db";
import { useImportManager } from "./useImportManager";

/**
 * Options for useSavedDocuments hook.
 * Extends ListDocumentsOptions but excludes savedOnly (always true).
 */
export interface UseSavedDocumentsOptions extends Omit<ListDocumentsOptions, "savedOnly"> {
  autoRefresh?: boolean;
}

/**
 * Hook to fetch and manage saved documents from the database.
 * Returns only documents that have been saved for later reading.
 * Supports pagination, sorting, and refresh capability.
 */
export function useSavedDocuments(options?: UseSavedDocumentsOptions) {
  const [documents, setDocuments] = useState<DocumentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const importManager = useImportManager();
  const autoRefresh = options?.autoRefresh ?? true;

  // Extract options values to use as stable dependencies
  const limit = options?.limit;
  const offset = options?.offset;
  const orderBy = options?.orderBy ?? "savedAt";
  const order = options?.order ?? "desc";

  const fetchDocuments = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const client = await getDbClient();
      const docs = await client.listDocuments({
        limit,
        offset,
        orderBy,
        order,
        savedOnly: true,
      });
      setDocuments(docs);
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setLoading(false);
    }
  }, [limit, offset, orderBy, order]);

  useEffect(() => {
    fetchDocuments();
  }, [fetchDocuments]);

  useEffect(() => {
    if (!importManager || !autoRefresh) {
      return;
    }

    const handleComplete = () => {
      fetchDocuments();
    };

    const unsubscribe = importManager.on("onJobComplete", handleComplete);

    return () => {
      unsubscribe();
    };
  }, [autoRefresh, fetchDocuments, importManager]);

  return {
    documents,
    loading,
    error,
    refresh: fetchDocuments,
  };
}
