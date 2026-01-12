/**
 * useDigest Hook
 *
 * React hook for fetching and managing daily digest data.
 * Fetches content items from local DB, sends to API for LLM synthesis.
 *
 * Track 3: Experience & Collaboration (Product)
 */

import type { ProviderId } from "@/context/ProviderConfigContext";
import { getDbClient } from "@/lib/db";
import { useCallback, useEffect, useState } from "react";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface UICitation {
  id: string;
  url: string;
  title: string;
  sourceName: string;
}

export interface UIDigestCard {
  id: string;
  title: string;
  summary: string;
  whyItMatters: string[];
  citations: UICitation[];
  relatedTopics: string[];
  confidence: "high" | "medium" | "low";
}

export interface Digest {
  id: string;
  date: string;
  title: string;
  status: "pending" | "generating" | "ready" | "failed";
  cards: UIDigestCard[];
  sourceItemCount: number;
  generatedAt?: number;
  processingTimeMs?: number;
  error?: string;
}

/** Content item format for API request */
interface ContentItemInput {
  id: string;
  title: string;
  content: string;
  snippet?: string;
  sourceUrl?: string;
  sourceName?: string;
  topics?: string[];
  publishedAt?: string;
}

/** Provider configuration for API request */
export interface DigestProviderConfig {
  providerId: ProviderId;
  apiKey: string;
  baseUrl: string;
  model: string;
}

interface UseDigestOptions {
  /** User ID */
  userId: string;
  /** Date in YYYY-MM-DD format (defaults to today) */
  date?: string;
  /** Whether to fetch on mount */
  autoFetch?: boolean;
  /** Maximum number of cards to generate */
  maxCards?: number;
  /** Provider configuration (from ProviderConfigContext) */
  provider?: DigestProviderConfig;
}

interface UseDigestReturn {
  /** Current digest data */
  digest: Digest | null;
  /** Loading state */
  isLoading: boolean;
  /** Error state */
  error: Error | null;
  /** Refresh/fetch digest */
  refresh: () => Promise<void>;
  /** Regenerate digest (forces new LLM call) */
  regenerate: () => Promise<void>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper: Parse topics from JSON
// ─────────────────────────────────────────────────────────────────────────────

function parseTopics(topicsJson: string): string[] {
  try {
    const parsed = JSON.parse(topicsJson);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Hook Implementation
// ─────────────────────────────────────────────────────────────────────────────

export function useDigest({
  userId,
  date,
  autoFetch = true,
  maxCards = 5,
  provider,
}: UseDigestOptions): UseDigestReturn {
  const [digest, setDigest] = useState<Digest | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const targetDate = date || new Date().toISOString().split("T")[0];

  /**
   * Fetch content items from local DB and send to API for synthesis.
   */
  const fetchDigest = useCallback(
    async (regenerate = false) => {
      setIsLoading(true);
      setError(null);

      // Show generating status
      setDigest((prev) => (prev ? { ...prev, status: "generating" } : null));

      try {
        const db = await getDbClient();

        // Get content items from last 24 hours
        const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;

        const contentItems = await db.listContentItems({
          startTime: oneDayAgo,
          limit: 50,
        });

        // Transform to API format
        const apiItems: ContentItemInput[] = contentItems.map((item) => ({
          id: item.itemId,
          title: item.title,
          content: item.content,
          snippet: item.snippet ?? undefined,
          sourceUrl: item.sourceUrl ?? undefined,
          sourceName: item.source,
          topics: parseTopics(item.topicsJson),
          publishedAt: item.publishedAt ? new Date(item.publishedAt).toISOString() : undefined,
        }));

        // POST to digest API for LLM synthesis
        const response = await fetch("/api/ai/digest", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            userId,
            date: targetDate,
            regenerate,
            contentItems: apiItems,
            maxCards,
            // Include provider config if available
            provider: provider
              ? {
                  providerId: provider.providerId,
                  apiKey: provider.apiKey,
                  baseUrl: provider.baseUrl,
                  model: provider.model,
                }
              : undefined,
          }),
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error?.message || `API error: ${response.status}`);
        }

        const digestData: Digest = await response.json();
        setDigest(digestData);
      } catch (err) {
        console.error("[useDigest] Error fetching digest:", err);
        const digestError = err instanceof Error ? err : new Error("Unknown error");
        setError(digestError);

        // Set failed status
        setDigest((prev) =>
          prev
            ? { ...prev, status: "failed", error: digestError.message }
            : {
                id: `digest-${targetDate}`,
                date: targetDate,
                title: "Daily Digest",
                status: "failed",
                cards: [],
                sourceItemCount: 0,
                error: digestError.message,
              }
        );
      } finally {
        setIsLoading(false);
      }
    },
    [userId, targetDate, maxCards, provider]
  );

  /**
   * Regenerate forces a new LLM call even if cached.
   */
  const regenerate = useCallback(async () => {
    await fetchDigest(true);
  }, [fetchDigest]);

  useEffect(() => {
    if (autoFetch) {
      fetchDigest(false);
    }
  }, [autoFetch, fetchDigest]);

  return {
    digest,
    isLoading,
    error,
    refresh: () => fetchDigest(false),
    regenerate,
  };
}
