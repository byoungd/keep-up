/**
 * useCopilotHandlers Hook
 *
 * Manages the full copilot suggestion lifecycle:
 * - Fetching suggestions from AI Gateway
 * - Accept/reject/partial acceptance
 * - Streaming support
 * - Integration with editor
 */

"use client";

import { getFirstLine, getFirstWord } from "@/components/ai/GhostText";
import { useCallback, useEffect, useRef, useState } from "react";

/** Copilot state */
export type CopilotState =
  | "idle" // No active suggestion
  | "loading" // Fetching suggestion
  | "streaming" // Streaming response
  | "ready" // Suggestion ready to accept
  | "accepting" // Applying suggestion
  | "error"; // Error occurred

/** Copilot suggestion */
export interface CopilotSuggestion {
  /** Unique ID */
  id: string;
  /** Full suggestion text */
  text: string;
  /** Remaining text (after partial accepts) */
  remainingText: string;
  /** Accepted text so far */
  acceptedText: string;
  /** Confidence score (0-1) */
  confidence: number;
  /** Token usage */
  usage: { inputTokens: number; outputTokens: number };
  /** Latency in ms */
  latencyMs: number;
  /** Timestamp */
  createdAt: number;
}

/** Hook options */
export interface UseCopilotHandlersOptions {
  /** Document ID */
  docId: string;
  /** User ID */
  userId: string;
  /** API base URL */
  apiBaseUrl?: string;
  /** Whether copilot is enabled */
  enabled?: boolean;
  /** Maximum suggestion length in tokens */
  maxTokens?: number;
  /** Callback to insert text at cursor */
  insertText?: (text: string) => void;
  /** Callback when suggestion is accepted */
  onAccept?: (suggestion: CopilotSuggestion) => void;
  /** Callback when suggestion is rejected */
  onReject?: (suggestion: CopilotSuggestion) => void;
  /** Callback on error */
  onError?: (error: Error) => void;
}

/** Hook return type */
export interface UseCopilotHandlersReturn {
  /** Current state */
  state: CopilotState;
  /** Current suggestion */
  suggestion: CopilotSuggestion | null;
  /** Error message */
  error: string | null;
  /** Whether suggestion is visible */
  isVisible: boolean;
  /** Streaming text (partial) */
  streamingText: string;
  /** Request a new suggestion */
  requestSuggestion: (prefix: string, suffix?: string, context?: string) => Promise<void>;
  /** Accept full suggestion */
  accept: () => void;
  /** Accept next word */
  acceptWord: () => void;
  /** Accept next line */
  acceptLine: () => void;
  /** Accept partial (custom amount) */
  acceptPartial: (charCount: number) => void;
  /** Reject suggestion */
  reject: () => void;
  /** Cancel loading */
  cancel: () => void;
  /** Reset state */
  reset: () => void;
}

const DEFAULT_API_BASE_URL = "/api/ai";

/**
 * Hook for managing copilot suggestions.
 */
export function useCopilotHandlers(options: UseCopilotHandlersOptions): UseCopilotHandlersReturn {
  const {
    docId,
    userId,
    apiBaseUrl = DEFAULT_API_BASE_URL,
    enabled = true,
    maxTokens = 100,
    insertText,
    onAccept,
    onReject,
    onError,
  } = options;

  const [state, setState] = useState<CopilotState>("idle");
  const [suggestion, setSuggestion] = useState<CopilotSuggestion | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [streamingText, setStreamingText] = useState("");

  const abortControllerRef = useRef<AbortController | null>(null);
  const suggestionIdRef = useRef(0);

  /**
   * Request a new suggestion from the AI Gateway.
   */
  const requestSuggestion = useCallback(
    // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: orchestration combines debounce, provider calls, caching, and UI side effects
    async (prefix: string, suffix?: string, context?: string) => {
      if (!enabled) {
        return;
      }

      // Cancel any existing request
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }

      const requestId = ++suggestionIdRef.current;
      abortControllerRef.current = new AbortController();

      setState("loading");
      setError(null);
      setStreamingText("");
      setSuggestion(null);

      try {
        const response = await fetch(`${apiBaseUrl}/copilot`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            prefix,
            suffix,
            context,
            userId,
            docId,
            maxTokens,
          }),
          signal: abortControllerRef.current.signal,
        });

        // Check if this request is still current
        if (requestId !== suggestionIdRef.current) {
          return;
        }

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.message || `Request failed: ${response.status}`);
        }

        // Handle regular JSON response
        const data = await response.json();

        if (requestId !== suggestionIdRef.current) {
          return;
        }

        const newSuggestion: CopilotSuggestion = {
          id: data.id || crypto.randomUUID(),
          text: data.suggestion || "",
          remainingText: data.suggestion || "",
          acceptedText: "",
          confidence: data.confidence || 0.8,
          usage: data.usage || { inputTokens: 0, outputTokens: 0 },
          latencyMs: data.latencyMs || 0,
          createdAt: Date.now(),
        };

        if (newSuggestion.text) {
          setSuggestion(newSuggestion);
          setState("ready");
        } else {
          setState("idle");
        }
      } catch (err) {
        if (requestId !== suggestionIdRef.current) {
          return;
        }

        if (err instanceof Error && err.name === "AbortError") {
          setState("idle");
          return;
        }

        const errorMessage = err instanceof Error ? err.message : "Failed to get suggestion";
        setError(errorMessage);
        setState("error");
        onError?.(err instanceof Error ? err : new Error(errorMessage));
      }
    },
    [enabled, apiBaseUrl, userId, docId, maxTokens, onError]
  );

  /**
   * Accept full suggestion.
   */
  const accept = useCallback(() => {
    if (!suggestion || state !== "ready") {
      return;
    }

    setState("accepting");

    // Insert the remaining text
    insertText?.(suggestion.remainingText);

    // Update suggestion state
    const updatedSuggestion = {
      ...suggestion,
      acceptedText: suggestion.text,
      remainingText: "",
    };
    setSuggestion(updatedSuggestion);

    // Notify callback
    onAccept?.(updatedSuggestion);

    // Reset to idle
    setState("idle");
    setSuggestion(null);
  }, [suggestion, state, insertText, onAccept]);

  /**
   * Accept next word.
   */
  const acceptWord = useCallback(() => {
    if (!suggestion || state !== "ready") {
      return;
    }

    const word = getFirstWord(suggestion.remainingText);
    if (!word) {
      return;
    }

    // Insert the word
    insertText?.(word);

    // Update suggestion
    const newRemaining = suggestion.remainingText.slice(word.length).trimStart();
    const newAccepted = suggestion.acceptedText + word;

    if (newRemaining) {
      setSuggestion({
        ...suggestion,
        remainingText: newRemaining,
        acceptedText: newAccepted,
      });
    } else {
      // All accepted
      onAccept?.({ ...suggestion, acceptedText: suggestion.text, remainingText: "" });
      setState("idle");
      setSuggestion(null);
    }
  }, [suggestion, state, insertText, onAccept]);

  /**
   * Accept next line.
   */
  const acceptLine = useCallback(() => {
    if (!suggestion || state !== "ready") {
      return;
    }

    const line = getFirstLine(suggestion.remainingText);
    if (!line) {
      return;
    }

    // Insert the line (including newline if present)
    const insertLength = suggestion.remainingText.startsWith(`${line}\n`)
      ? line.length + 1
      : line.length;
    insertText?.(suggestion.remainingText.slice(0, insertLength));

    // Update suggestion
    const newRemaining = suggestion.remainingText.slice(insertLength);
    const newAccepted = suggestion.acceptedText + suggestion.remainingText.slice(0, insertLength);

    if (newRemaining) {
      setSuggestion({
        ...suggestion,
        remainingText: newRemaining,
        acceptedText: newAccepted,
      });
    } else {
      // All accepted
      onAccept?.({ ...suggestion, acceptedText: suggestion.text, remainingText: "" });
      setState("idle");
      setSuggestion(null);
    }
  }, [suggestion, state, insertText, onAccept]);

  /**
   * Accept partial (custom character count).
   */
  const acceptPartial = useCallback(
    (charCount: number) => {
      if (!suggestion || state !== "ready") {
        return;
      }
      if (charCount <= 0 || charCount > suggestion.remainingText.length) {
        return;
      }

      const toInsert = suggestion.remainingText.slice(0, charCount);
      insertText?.(toInsert);

      const newRemaining = suggestion.remainingText.slice(charCount);
      const newAccepted = suggestion.acceptedText + toInsert;

      if (newRemaining) {
        setSuggestion({
          ...suggestion,
          remainingText: newRemaining,
          acceptedText: newAccepted,
        });
      } else {
        onAccept?.({ ...suggestion, acceptedText: suggestion.text, remainingText: "" });
        setState("idle");
        setSuggestion(null);
      }
    },
    [suggestion, state, insertText, onAccept]
  );

  /**
   * Reject suggestion.
   */
  const reject = useCallback(() => {
    if (!suggestion) {
      setState("idle");
      return;
    }

    onReject?.(suggestion);
    setState("idle");
    setSuggestion(null);
    setStreamingText("");
  }, [suggestion, onReject]);

  /**
   * Cancel loading.
   */
  const cancel = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    suggestionIdRef.current++;
    setState("idle");
    setSuggestion(null);
    setStreamingText("");
    setError(null);
  }, []);

  /**
   * Reset state.
   */
  const reset = useCallback(() => {
    cancel();
    setSuggestion(null);
    setError(null);
  }, [cancel]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  // Compute visibility
  const isVisible = state === "ready" || state === "streaming";

  return {
    state,
    suggestion,
    error,
    isVisible,
    streamingText,
    requestSuggestion,
    accept,
    acceptWord,
    acceptLine,
    acceptPartial,
    reject,
    cancel,
    reset,
  };
}
