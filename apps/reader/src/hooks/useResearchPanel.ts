/**
 * useResearchPanel Hook
 *
 * Manages research panel state and RAG queries.
 * Handles search, results display, and citation tracking.
 */

"use client";

import { useCallback, useState } from "react";

/** Citation for display */
export interface DisplayCitation {
  /** Citation index (1-based) */
  index: number;
  /** Document ID */
  docId: string;
  /** Document title */
  title?: string;
  /** Excerpt from source */
  excerpt: string;
  /** Section title */
  section?: string;
  /** Confidence score */
  confidence: number;
  /** Whether citation is expanded */
  isExpanded: boolean;
}

/** Research result */
export interface ResearchResult {
  /** Query that was searched */
  query: string;
  /** Generated answer */
  answer: string;
  /** Citations used */
  citations: DisplayCitation[];
  /** Processing time in ms */
  processingTimeMs: number;
  /** Timestamp */
  timestamp: number;
}

/** Research panel state */
export interface ResearchPanelState {
  /** Current query */
  query: string;
  /** Whether search is loading */
  isLoading: boolean;
  /** Error message */
  error: string | null;
  /** Current result */
  result: ResearchResult | null;
  /** Search history */
  history: ResearchResult[];
  /** Panel visibility */
  isOpen: boolean;
}

/** Hook options */
export interface UseResearchPanelOptions {
  /** API base URL */
  apiBaseUrl?: string;
  /** User ID */
  userId: string;
  /** Document IDs to search (optional) */
  docIds?: string[];
  /** Maximum history items */
  maxHistory?: number;
  /** Callback when citation is clicked */
  onCitationClick?: (citation: DisplayCitation) => void;
}

/** Hook return type */
export interface UseResearchPanelReturn extends ResearchPanelState {
  /** Set query */
  setQuery: (query: string) => void;
  /** Execute search */
  search: () => Promise<void>;
  /** Clear result */
  clearResult: () => void;
  /** Clear history */
  clearHistory: () => void;
  /** Toggle panel */
  togglePanel: () => void;
  /** Open panel */
  openPanel: () => void;
  /** Close panel */
  closePanel: () => void;
  /** Toggle citation expansion */
  toggleCitation: (index: number) => void;
  /** Select history item */
  selectHistory: (index: number) => void;
}

const DEFAULT_API_BASE_URL = "/api/ai";

/**
 * Hook for managing research panel state.
 */
export function useResearchPanel(options: UseResearchPanelOptions): UseResearchPanelReturn {
  const { apiBaseUrl = DEFAULT_API_BASE_URL, userId, docIds, maxHistory = 10 } = options;

  const [state, setState] = useState<ResearchPanelState>({
    query: "",
    isLoading: false,
    error: null,
    result: null,
    history: [],
    isOpen: false,
  });

  /**
   * Set query.
   */
  const setQuery = useCallback((query: string) => {
    setState((prev) => ({ ...prev, query, error: null }));
  }, []);

  /**
   * Execute search.
   */
  const search = useCallback(async () => {
    if (!state.query.trim()) {
      return;
    }

    setState((prev) => ({ ...prev, isLoading: true, error: null }));

    try {
      const response = await fetch(`${apiBaseUrl}/research`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: state.query,
          userId,
          docIds,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `Search failed: ${response.status}`);
      }

      const data = await response.json();

      const result: ResearchResult = {
        query: state.query,
        answer: data.answer || "",
        citations: (data.citations || []).map(
          (
            c: {
              index: number;
              docId: string;
              title?: string;
              excerpt: string;
              location?: { section?: string };
              confidence: number;
            },
            i: number
          ) => ({
            index: i + 1,
            docId: c.docId,
            title: c.title,
            excerpt: c.excerpt,
            section: c.location?.section,
            confidence: c.confidence,
            isExpanded: false,
          })
        ),
        processingTimeMs: data.processingTimeMs || 0,
        timestamp: Date.now(),
      };

      setState((prev) => ({
        ...prev,
        isLoading: false,
        result,
        history: [result, ...prev.history.slice(0, maxHistory - 1)],
      }));
    } catch (error) {
      setState((prev) => ({
        ...prev,
        isLoading: false,
        error: error instanceof Error ? error.message : "Search failed",
      }));
    }
  }, [state.query, apiBaseUrl, userId, docIds, maxHistory]);

  /**
   * Clear result.
   */
  const clearResult = useCallback(() => {
    setState((prev) => ({ ...prev, result: null, query: "", error: null }));
  }, []);

  /**
   * Clear history.
   */
  const clearHistory = useCallback(() => {
    setState((prev) => ({ ...prev, history: [] }));
  }, []);

  /**
   * Toggle panel.
   */
  const togglePanel = useCallback(() => {
    setState((prev) => ({ ...prev, isOpen: !prev.isOpen }));
  }, []);

  /**
   * Open panel.
   */
  const openPanel = useCallback(() => {
    setState((prev) => ({ ...prev, isOpen: true }));
  }, []);

  /**
   * Close panel.
   */
  const closePanel = useCallback(() => {
    setState((prev) => ({ ...prev, isOpen: false }));
  }, []);

  /**
   * Toggle citation expansion.
   */
  const toggleCitation = useCallback((index: number) => {
    setState((prev) => {
      if (!prev.result) {
        return prev;
      }

      const updatedCitations = prev.result.citations.map((c) =>
        c.index === index ? { ...c, isExpanded: !c.isExpanded } : c
      );

      return {
        ...prev,
        result: { ...prev.result, citations: updatedCitations },
      };
    });
  }, []);

  /**
   * Select history item.
   */
  const selectHistory = useCallback((index: number) => {
    setState((prev) => {
      const item = prev.history[index];
      if (!item) {
        return prev;
      }

      return {
        ...prev,
        result: item,
        query: item.query,
      };
    });
  }, []);

  return {
    ...state,
    setQuery,
    search,
    clearResult,
    clearHistory,
    togglePanel,
    openPanel,
    closePanel,
    toggleCitation,
    selectHistory,
  };
}
