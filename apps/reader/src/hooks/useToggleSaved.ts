/**
 * Hook for toggling the saved state of a document.
 */

import { useCallback, useState } from "react";
import { getDbClient } from "../lib/db";

/**
 * Hook to toggle the saved (read later) state of a document.
 * Returns a function to toggle the saved state and loading state.
 */
export function useToggleSaved() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  /**
   * Toggle the saved state of a document.
   * @param docId - The document ID to toggle
   * @param save - true to save, false to unsave
   */
  const toggleSaved = useCallback(async (docId: string, save: boolean): Promise<void> => {
    try {
      setLoading(true);
      setError(null);
      const client = await getDbClient();
      const savedAt = save ? Date.now() : null;
      await client.updateDocumentSavedAt(docId, savedAt);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      setError(error);
      throw error;
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    toggleSaved,
    loading,
    error,
  };
}
