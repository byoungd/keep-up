/**
 * Hook for accessing documents from the database.
 */

import type { DocumentRow, ListDocumentsOptions } from "@ku0/db";
import { useCallback, useEffect, useState } from "react";
import { getDbClient } from "../lib/db";
import { useImportManager } from "./useImportManager";

/**
 * Hook to fetch and manage documents from the database.
 * Supports pagination, sorting, and refresh capability.
 */
export interface UseDocumentsOptions extends ListDocumentsOptions {
  autoRefresh?: boolean;
}

export function useDocuments(options?: UseDocumentsOptions) {
  const [documents, setDocuments] = useState<DocumentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const importManager = useImportManager();
  const autoRefresh = options?.autoRefresh ?? true;

  // Extract options values to use as stable dependencies
  const limit = options?.limit;
  const offset = options?.offset;
  const orderBy = options?.orderBy;
  const order = options?.order;

  const fetchDocuments = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const client = await getDbClient();
      const docs = await client.listDocuments({ limit, offset, orderBy, order });
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
