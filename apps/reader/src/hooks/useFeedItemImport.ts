/**
 * Hook for importing feed items as LFCC documents.
 */

import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { getImportManager } from "../lib/db";

export interface UseFeedItemImportReturn {
  importFeedItem: (feedItemId: string, feedUrl: string) => Promise<string | null>;
  isImporting: boolean;
  error: Error | null;
}

/**
 * Creates a source reference for an RSS feed item.
 * Format: rss://{feedUrl}#{itemId}
 */
function createFeedItemSourceRef(feedUrl: string, itemId: string): string {
  // Use the feed URL and item ID to create a unique reference
  return `rss://${encodeURIComponent(feedUrl)}#${encodeURIComponent(itemId)}`;
}

/**
 * Hook to import a feed item as an LFCC document.
 */
export function useFeedItemImport(): UseFeedItemImportReturn {
  const router = useRouter();
  const [isImporting, setIsImporting] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const importFeedItem = useCallback(
    async (feedItemId: string, feedUrl: string): Promise<string | null> => {
      setIsImporting(true);
      setError(null);

      try {
        const manager = await getImportManager();

        // Create source reference for the feed item
        const sourceRef = createFeedItemSourceRef(feedUrl, feedItemId);

        // Enqueue the import job
        const jobId = await manager.enqueue({
          sourceType: "rss",
          sourceRef,
        });

        // Wait for job completion using event listeners
        const result = await new Promise<string | null>((resolve, reject) => {
          const timeout = setTimeout(() => {
            unsubscribeComplete();
            unsubscribeFailed();
            reject(new Error("Import timed out"));
          }, 30000); // 30 seconds timeout

          const unsubscribeComplete = manager.on("onJobComplete", (completedJobId, documentId) => {
            if (completedJobId === jobId) {
              clearTimeout(timeout);
              unsubscribeComplete();
              unsubscribeFailed();
              resolve(documentId ?? null);
            }
          });

          const unsubscribeFailed = manager.on("onJobFailed", (failedJobId, err) => {
            if (failedJobId === jobId) {
              clearTimeout(timeout);
              unsubscribeComplete();
              unsubscribeFailed();
              reject(err);
            }
          });
        });

        if (result) {
          // Navigate to the reader with the new document
          router.push(`/reader/${result}`);
        }

        return result;
      } catch (err) {
        const importError = err instanceof Error ? err : new Error("Import failed");
        setError(importError);
        console.error("[useFeedItemImport] Failed to import:", err);
        return null;
      } finally {
        setIsImporting(false);
      }
    },
    [router]
  );

  return {
    importFeedItem,
    isImporting,
    error,
  };
}
