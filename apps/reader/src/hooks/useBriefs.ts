/**
 * Hook for managing Living Briefs.
 */

import { getDbClient } from "@/lib/db";
import type { BriefItemRow, BriefItemType, BriefRow } from "@keepup/db";
import { useCallback, useEffect, useState } from "react";

export interface UseBriefsReturn {
  briefs: BriefRow[];
  isLoading: boolean;
  error: Error | null;
  refresh: () => Promise<void>;
  createBrief: (title: string, description?: string) => Promise<BriefRow>;
  addItemToBrief: (
    briefId: string,
    item: {
      itemId: string;
      itemType: BriefItemType;
      title: string;
      sourceUrl?: string;
      excerpt?: string;
    }
  ) => Promise<void>;
}

export function useBriefs(): UseBriefsReturn {
  const [briefs, setBriefs] = useState<BriefRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchBriefs = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const db = await getDbClient();
      const results = await db.listBriefs({ limit: 100 });
      setBriefs(results);
    } catch (err) {
      console.error("[useBriefs] Failed to fetch briefs:", err);
      setError(err instanceof Error ? err : new Error("Failed to fetch briefs"));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBriefs();
  }, [fetchBriefs]);

  const createBrief = useCallback(
    async (title: string, description?: string): Promise<BriefRow> => {
      const db = await getDbClient();
      const now = Date.now();
      const briefId = `brief_${now}_${Math.random().toString(36).slice(2, 9)}`;

      const newBrief: Omit<BriefRow, "createdAt" | "updatedAt"> = {
        briefId,
        title,
        description: description ?? null,
        coverImageUrl: null,
        isPublic: false,
        ownerId: "local", // TODO: Use actual user ID when auth is implemented
        documentId: null,
      };

      await db.createBrief(newBrief);

      // Refresh the list
      await fetchBriefs();

      // Return the created brief
      const created = await db.getBrief(briefId);
      if (!created) {
        throw new Error("Failed to retrieve created brief");
      }
      return created;
    },
    [fetchBriefs]
  );

  const addItemToBrief = useCallback(
    async (
      briefId: string,
      item: {
        itemId: string;
        itemType: BriefItemType;
        title: string;
        sourceUrl?: string;
        excerpt?: string;
      }
    ): Promise<void> => {
      const db = await getDbClient();

      // Get current items to determine order index
      const existingItems = await db.listBriefItems(briefId);
      const orderIndex = existingItems.length;

      const briefItem: BriefItemRow = {
        briefId,
        itemId: item.itemId,
        itemType: item.itemType,
        title: item.title,
        sourceUrl: item.sourceUrl ?? null,
        excerpt: item.excerpt ?? null,
        note: null,
        orderIndex,
        addedAt: Date.now(),
      };

      await db.addBriefItem(briefItem);
    },
    []
  );

  return {
    briefs,
    isLoading,
    error,
    refresh: fetchBriefs,
    createBrief,
    addItemToBrief,
  };
}
