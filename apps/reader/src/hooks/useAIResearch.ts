"use client";

import { parseSseText } from "@/lib/ai/streamUtils";
import { useCallback, useRef, useState } from "react";

const REQUEST_TIMEOUT_MS = 60_000;
const SSE_DONE = "[" + "DONE" + "]";

// Extract stream processing to reduce complexity
function processStreamChunk(
  chunk: string,
  accumulated: string,
  onUpdate: (content: string) => void
): string {
  const lines = chunk.split("\n");
  let result = accumulated;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line.startsWith("data:")) {
      continue;
    }
    const payload = line.slice(5).trim();
    if (!payload || payload === SSE_DONE) {
      continue;
    }
    const textDelta = parseSseText(payload);
    if (textDelta) {
      result += textDelta;
      onUpdate(result);
    }
  }

  return result;
}

// Extract stream reading to reduce complexity
async function readStream(
  body: ReadableStream<Uint8Array>,
  onUpdate: (content: string) => void
): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let accumulated = "";

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) {
        break;
      }
      const chunk = decoder.decode(value, { stream: true });
      accumulated = processStreamChunk(chunk, accumulated, onUpdate);
    }
  } finally {
    reader.releaseLock();
  }
}

export interface ResearchResult {
  content: string;
  sources?: string[];
}

export interface UseAIResearchReturn {
  research: (topic: string) => Promise<void>;
  abort: () => void;
  content: string;
  isResearching: boolean;
  error: string | null;
}

export function useAIResearch(): UseAIResearchReturn {
  const [content, setContent] = useState("");
  const [isResearching, setIsResearching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const timeoutRef = useRef<number | null>(null);

  const clearTimeoutRef = useCallback(() => {
    if (timeoutRef.current) {
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  const abort = useCallback(() => {
    abortRef.current?.abort();
    clearTimeoutRef();
    setIsResearching(false);
  }, [clearTimeoutRef]);

  const research = useCallback(
    async (topic: string) => {
      // Reset state
      abortRef.current?.abort();
      abortRef.current = new AbortController();
      setContent("");
      setError(null);
      setIsResearching(true);

      // Setup timeout
      clearTimeoutRef();
      timeoutRef.current = window.setTimeout(() => {
        abortRef.current?.abort();
        setError("Request timed out");
        setIsResearching(false);
      }, REQUEST_TIMEOUT_MS);

      const prompt = `Research the following topic for a language learner. Provide a concise overview with key points and learning resources:

Topic: ${topic}`;

      try {
        const res = await fetch("/api/ai/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            prompt,
            stream: true,
            messages: [],
          }),
          signal: abortRef.current.signal,
        });

        if (!res.ok || !res.body) {
          throw new Error(`Request failed: ${res.status}`);
        }

        await readStream(res.body, setContent);
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          setError(err instanceof Error ? err.message : "Research failed");
        }
      } finally {
        clearTimeoutRef();
        setIsResearching(false);
      }
    },
    [clearTimeoutRef]
  );

  return {
    research,
    abort,
    content,
    isResearching,
    error,
  };
}
