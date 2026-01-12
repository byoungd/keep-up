/**
 * Hook for document management actions (create, delete, rename).
 */

import { LoroDoc, createEmptyDoc } from "@keepup/lfcc-bridge";
import { useCallback, useState } from "react";
import { getDbClient } from "../lib/db";
import { createLocalDocMetadata } from "../lib/persistence/docMetadata";
import { docPersistence } from "../lib/persistence/docPersistence";

/**
 * Generate a unique document ID.
 * Uses crypto.randomUUID when available, falls back to simple random ID.
 */
function generateDocId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `doc_${crypto.randomUUID().replace(/-/g, "").slice(0, 24)}`;
  }
  // Fallback for older environments
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let id = "doc_";
  for (let i = 0; i < 24; i++) {
    id += chars[Math.floor(Math.random() * chars.length)];
  }
  return id;
}

export interface UseDocumentActionsResult {
  /** Create a new blank document */
  createDocument: (title?: string) => Promise<string>;
  /** Delete a document by ID */
  deleteDocument: (docId: string) => Promise<void>;
  /** Rename a document */
  renameDocument: (docId: string, newTitle: string) => Promise<void>;
  /** Whether an operation is in progress */
  loading: boolean;
  /** Last error, if any */
  error: Error | null;
}

/**
 * Hook providing document management operations.
 * Use with useDocuments for a complete CRUD experience.
 */
export function useDocumentActions(): UseDocumentActionsResult {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const createDocument = useCallback(async (title = "Untitled"): Promise<string> => {
    try {
      setLoading(true);
      setError(null);

      const docId = generateDocId();
      const now = Date.now();

      // 1. Create empty Loro doc and export snapshot
      const loroDoc = new LoroDoc();
      createEmptyDoc(loroDoc);
      const snapshot = loroDoc.export({ mode: "snapshot" });

      // 2. Get DB client
      const client = await getDbClient();

      // 3. Create metadata for docPersistence
      const metadata = createLocalDocMetadata(docId, title);

      // 4. Persist everything atomically (best effort - failures should roll back)
      try {
        // Save to docPersistence (IDB for local CRDT storage)
        await docPersistence.saveDoc(docId, snapshot);
        await docPersistence.saveMetadata(metadata);

        // Save to DB (SQLite/Dexie for document list)
        await client.upsertDocument({
          docId,
          title,
          activePolicyId: null,
          headFrontier: null,
          savedAt: null,
          createdAt: now,
          updatedAt: now,
        });
      } catch (persistError) {
        // Rollback: try to clean up partial records
        try {
          await docPersistence.deleteDoc(docId);
          await docPersistence.deleteMetadata(docId);
          await client.deleteDocument(docId);
        } catch {
          // Ignore cleanup errors
        }
        throw persistError;
      }

      return docId;
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      setError(error);
      throw error;
    } finally {
      setLoading(false);
    }
  }, []);

  const deleteDocument = useCallback(async (docId: string) => {
    try {
      setLoading(true);
      setError(null);
      const client = await getDbClient();
      await client.deleteDocument(docId);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      setError(error);
      throw error;
    } finally {
      setLoading(false);
    }
  }, []);

  const renameDocument = useCallback(async (docId: string, newTitle: string) => {
    try {
      setLoading(true);
      setError(null);
      const client = await getDbClient();
      await client.updateDocumentTitle(docId, newTitle);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      setError(error);
      throw error;
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    createDocument,
    deleteDocument,
    renameDocument,
    loading,
    error,
  };
}
