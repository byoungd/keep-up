/**
 * useSuggestions Hook
 *
 * Manages AI suggestions for collaborative editing.
 * Fetches suggestions, tracks state, and handles apply/reject actions.
 */

"use client";

import { useCallback, useEffect, useState } from "react";

/** Citation source */
export interface Citation {
  id: string;
  type: "document" | "web" | "knowledge_base";
  title: string;
  url?: string;
  excerpt?: string;
  confidence: number;
}

/** Suggestion type */
export type SuggestionType = "completion" | "rewrite" | "expansion" | "summary" | "correction";

/** Suggestion status */
export type SuggestionStatus = "pending" | "applied" | "rejected" | "expired";

/** AI suggestion */
export interface Suggestion {
  id: string;
  docId: string;
  type: SuggestionType;
  content: string;
  citations: Citation[];
  targetPosition?: {
    blockId?: string;
    startOffset?: number;
    endOffset?: number;
  };
  confidence: number;
  status: SuggestionStatus;
  createdAt: number;
  expiresAt: number;
}

/** Suggestions state */
export interface SuggestionsState {
  /** List of suggestions */
  suggestions: Suggestion[];
  /** Loading state */
  isLoading: boolean;
  /** Error message */
  error: string | null;
  /** Whether AI suggestions are enabled */
  isEnabled: boolean;
  /** Last applied suggestion ID (for undo) */
  lastAppliedId: string | null;
}

/** Suggestions hook options */
export interface UseSuggestionsOptions {
  /** Document ID */
  docId: string;
  /** Whether AI suggestions are enabled */
  enabled?: boolean;
  /** API base URL */
  apiBaseUrl?: string;
  /** Auto-fetch interval in ms (0 to disable) */
  autoFetchInterval?: number;
  /** Callback when suggestion is applied */
  onApply?: (suggestion: Suggestion, content: string) => void;
  /** Callback when suggestion is rejected */
  onReject?: (suggestion: Suggestion) => void;
  /** Callback when suggestion is undone */
  onUndo?: (suggestion: Suggestion) => void;
}

/** Suggestions hook return type */
export interface UseSuggestionsReturn extends SuggestionsState {
  /** Fetch suggestions for context */
  fetchSuggestions: (context: string, type?: SuggestionType) => Promise<void>;
  /** Apply a suggestion */
  applySuggestion: (suggestionId: string) => Promise<boolean>;
  /** Reject a suggestion */
  rejectSuggestion: (suggestionId: string) => Promise<boolean>;
  /** Undo last applied suggestion */
  undoLastApplied: () => Promise<boolean>;
  /** Clear all suggestions */
  clearSuggestions: () => void;
  /** Refresh suggestions */
  refresh: () => Promise<void>;
}

const DEFAULT_API_BASE_URL = "/api/collab";

/**
 * Hook for managing AI suggestions.
 */
export function useSuggestions(options: UseSuggestionsOptions): UseSuggestionsReturn {
  const {
    docId,
    enabled = false,
    apiBaseUrl = DEFAULT_API_BASE_URL,
    autoFetchInterval = 0,
    onApply,
    onReject,
    onUndo,
  } = options;

  const [state, setState] = useState<SuggestionsState>({
    suggestions: [],
    isLoading: false,
    error: null,
    isEnabled: enabled,
    lastAppliedId: null,
  });

  // Update enabled state when prop changes
  useEffect(() => {
    setState((prev) => ({ ...prev, isEnabled: enabled }));
  }, [enabled]);

  /**
   * Fetch suggestions from API.
   */
  const fetchSuggestions = useCallback(
    async (context: string, type: SuggestionType = "completion") => {
      if (!state.isEnabled) {
        return;
      }

      setState((prev) => ({ ...prev, isLoading: true, error: null }));

      try {
        const response = await fetch(`${apiBaseUrl}/suggestions`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            docId,
            context,
            type,
          }),
        });

        if (!response.ok) {
          throw new Error(`Failed to fetch suggestions: ${response.status}`);
        }

        const data = await response.json();

        setState((prev) => ({
          ...prev,
          suggestions: data.suggestions || [],
          isLoading: false,
          error: data.insufficientEvidence ? data.insufficientEvidenceReason : null,
        }));
      } catch (error) {
        setState((prev) => ({
          ...prev,
          isLoading: false,
          error: error instanceof Error ? error.message : "Failed to fetch suggestions",
        }));
      }
    },
    [docId, apiBaseUrl, state.isEnabled]
  );

  /**
   * Apply a suggestion.
   */
  const applySuggestion = useCallback(
    async (suggestionId: string): Promise<boolean> => {
      const suggestion = state.suggestions.find((s) => s.id === suggestionId);
      if (!suggestion || suggestion.status !== "pending") {
        return false;
      }

      try {
        // Update local state
        setState((prev) => ({
          ...prev,
          suggestions: prev.suggestions.map((s) =>
            s.id === suggestionId ? { ...s, status: "applied" as SuggestionStatus } : s
          ),
          lastAppliedId: suggestionId,
        }));

        // Call API to record audit event
        await fetch(`${apiBaseUrl}/suggestions/${suggestionId}/apply`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            docId,
            bytesLenDelta: suggestion.content.length,
          }),
        });

        // Notify callback
        onApply?.(suggestion, suggestion.content);

        return true;
      } catch (error) {
        console.error("[useSuggestions] Failed to apply suggestion:", error);
        return false;
      }
    },
    [state.suggestions, docId, apiBaseUrl, onApply]
  );

  /**
   * Reject a suggestion.
   */
  const rejectSuggestion = useCallback(
    async (suggestionId: string): Promise<boolean> => {
      const suggestion = state.suggestions.find((s) => s.id === suggestionId);
      if (!suggestion || suggestion.status !== "pending") {
        return false;
      }

      try {
        // Update local state
        setState((prev) => ({
          ...prev,
          suggestions: prev.suggestions.map((s) =>
            s.id === suggestionId ? { ...s, status: "rejected" as SuggestionStatus } : s
          ),
        }));

        // Call API to record audit event
        await fetch(`${apiBaseUrl}/suggestions/${suggestionId}/reject`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ docId }),
        });

        // Notify callback
        onReject?.(suggestion);

        return true;
      } catch (error) {
        console.error("[useSuggestions] Failed to reject suggestion:", error);
        return false;
      }
    },
    [state.suggestions, docId, apiBaseUrl, onReject]
  );

  /**
   * Undo last applied suggestion.
   */
  const undoLastApplied = useCallback(async (): Promise<boolean> => {
    if (!state.lastAppliedId) {
      return false;
    }

    const suggestion = state.suggestions.find((s) => s.id === state.lastAppliedId);
    if (!suggestion) {
      return false;
    }

    try {
      // Update local state
      setState((prev) => ({
        ...prev,
        suggestions: prev.suggestions.map((s) =>
          s.id === state.lastAppliedId ? { ...s, status: "pending" as SuggestionStatus } : s
        ),
        lastAppliedId: null,
      }));

      // Call API to record audit event
      await fetch(`${apiBaseUrl}/suggestions/${state.lastAppliedId}/undo`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          docId,
          bytesLenDelta: -suggestion.content.length,
        }),
      });

      // Notify callback
      onUndo?.(suggestion);

      return true;
    } catch (error) {
      console.error("[useSuggestions] Failed to undo suggestion:", error);
      return false;
    }
  }, [state.lastAppliedId, state.suggestions, docId, apiBaseUrl, onUndo]);

  /**
   * Clear all suggestions.
   */
  const clearSuggestions = useCallback(() => {
    setState((prev) => ({
      ...prev,
      suggestions: [],
      error: null,
      lastAppliedId: null,
    }));
  }, []);

  /**
   * Refresh suggestions (re-fetch with empty context).
   */
  const refresh = useCallback(async () => {
    await fetchSuggestions("");
  }, [fetchSuggestions]);

  // Auto-fetch interval
  useEffect(() => {
    if (!state.isEnabled || autoFetchInterval <= 0) {
      return;
    }

    const interval = setInterval(() => {
      // Remove expired suggestions
      setState((prev) => ({
        ...prev,
        suggestions: prev.suggestions.filter((s) => s.expiresAt > Date.now()),
      }));
    }, autoFetchInterval);

    return () => clearInterval(interval);
  }, [state.isEnabled, autoFetchInterval]);

  return {
    ...state,
    fetchSuggestions,
    applySuggestion,
    rejectSuggestion,
    undoLastApplied,
    clearSuggestions,
    refresh,
  };
}
