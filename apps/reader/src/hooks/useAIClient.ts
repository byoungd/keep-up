"use client";

/**
 * useAIClient Hook
 *
 * React hook providing a clean interface to AIClientService with:
 * - Reactive state management
 * - Automatic cleanup on unmount
 * - Health status subscription
 */

import {
  type AIClientError,
  type AIServiceHealth,
  type AIStreamRequest,
  type AIStreamResult,
  aiClient,
} from "@/lib/ai/aiClientService";
import * as React from "react";

export interface UseAIClientState {
  status: "idle" | "streaming" | "done" | "error";
  content: string;
  error: AIClientError | null;
  result: AIStreamResult | null;
  health: AIServiceHealth;
}

export interface UseAIClientActions {
  stream: (request: Omit<AIStreamRequest, "signal">) => Promise<void>;
  abort: () => void;
  reset: () => void;
}

export type UseAIClientReturn = UseAIClientState & UseAIClientActions;

const initialState: UseAIClientState = {
  status: "idle",
  content: "",
  error: null,
  result: null,
  health: {
    status: "healthy",
    circuitState: "CLOSED",
    failureCount: 0,
    lastFailureAt: null,
    retryAfterMs: null,
    metrics: {
      totalRequests: 0,
      totalFailures: 0,
      avgLatencyMs: null,
    },
  },
};

export function useAIClient(): UseAIClientReturn {
  const [state, setState] = React.useState<UseAIClientState>(initialState);
  const abortControllerRef = React.useRef<AbortController | null>(null);

  // Cleanup on unmount
  React.useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

  const stream = React.useCallback(async (request: Omit<AIStreamRequest, "signal">) => {
    // Abort any existing request
    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setState((prev) => ({
      ...prev,
      status: "streaming",
      content: "",
      error: null,
      result: null,
      health: aiClient.getHealth(),
    }));

    await aiClient.stream(
      { ...request, signal: controller.signal },
      {
        onChunk: (_delta, accumulated) => {
          setState((prev) => ({
            ...prev,
            content: accumulated,
          }));
        },
        onDone: (result) => {
          setState((prev) => ({
            ...prev,
            status: "done",
            result,
            health: aiClient.getHealth(),
          }));
        },
        onError: (error) => {
          setState((prev) => ({
            ...prev,
            status: "error",
            error,
            health: aiClient.getHealth(),
          }));
        },
      }
    );
  }, []);

  const abort = React.useCallback(() => {
    abortControllerRef.current?.abort();
    setState((prev) => ({
      ...prev,
      status: prev.status === "streaming" ? "idle" : prev.status,
      health: aiClient.getHealth(),
    }));
  }, []);

  const reset = React.useCallback(() => {
    abortControllerRef.current?.abort();
    setState(initialState);
  }, []);

  return {
    ...state,
    stream,
    abort,
    reset,
  };
}

/**
 * Simplified hook for streaming with callbacks (compatible with existing patterns)
 */
export interface UseAIStreamOptions {
  model: string;
  onContentUpdate?: (content: string) => void;
  onComplete?: (result: AIStreamResult) => void;
  onError?: (error: AIClientError) => void;
}

export interface UseAIStreamReturn {
  executeStream: (params: {
    prompt: string;
    history?: Array<{ role: "user" | "assistant"; content: string }>;
    attachments?: Array<{ type: "image"; url: string }>;
  }) => Promise<AIStreamResult | null>;
  abort: () => void;
  isStreaming: boolean;
  health: AIServiceHealth;
}

export function useAIStream(options: UseAIStreamOptions): UseAIStreamReturn {
  const [isStreaming, setIsStreaming] = React.useState(false);
  const [health, setHealth] = React.useState<AIServiceHealth>(aiClient.getHealth());
  const abortControllerRef = React.useRef<AbortController | null>(null);

  React.useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

  const executeStream = React.useCallback(
    async (params: {
      prompt: string;
      history?: Array<{ role: "user" | "assistant"; content: string }>;
      attachments?: Array<{ type: "image"; url: string }>;
    }): Promise<AIStreamResult | null> => {
      abortControllerRef.current?.abort();
      const controller = new AbortController();
      abortControllerRef.current = controller;

      setIsStreaming(true);
      setHealth(aiClient.getHealth());

      return new Promise((resolve) => {
        aiClient.stream(
          {
            prompt: params.prompt,
            model: options.model,
            history: params.history,
            attachments: params.attachments,
            signal: controller.signal,
          },
          {
            onChunk: (_delta, accumulated) => {
              options.onContentUpdate?.(accumulated);
            },
            onDone: (result) => {
              setIsStreaming(false);
              setHealth(aiClient.getHealth());
              options.onComplete?.(result);
              resolve(result);
            },
            onError: (error) => {
              setIsStreaming(false);
              setHealth(aiClient.getHealth());
              options.onError?.(error);
              resolve(null);
            },
          }
        );
      });
    },
    [options]
  );

  const abort = React.useCallback(() => {
    abortControllerRef.current?.abort();
    setIsStreaming(false);
    setHealth(aiClient.getHealth());
  }, []);

  return {
    executeStream,
    abort,
    isStreaming,
    health,
  };
}
