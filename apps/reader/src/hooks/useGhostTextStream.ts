/**
 * useGhostTextStream Hook
 *
 * Connects AI streaming events to GhostText component.
 * Manages ghost text visibility, content, and user interactions.
 */

"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export interface GhostTextState {
  /** Current ghost text content */
  text: string;
  /** Whether ghost text is visible */
  visible: boolean;
  /** Whether content is actively streaming */
  isStreaming: boolean;
  /** Block ID target for the edit (if applicable) */
  blockId?: string;
  /** Confidence score (0-1) */
  confidence?: number;
}

export interface UseGhostTextStreamOptions {
  /** Callback when user accepts the suggestion */
  onAccept?: (text: string, blockId?: string) => void;
  /** Callback when user rejects the suggestion */
  onReject?: () => void;
  /** Debounce delay before showing ghost text (ms) */
  showDelay?: number;
  /** Auto-hide timeout after streaming stops (ms) */
  hideTimeout?: number;
}

export interface UseGhostTextStreamReturn {
  /** Current ghost text state */
  state: GhostTextState;
  /** Show ghost text with content */
  show: (text: string, options?: { blockId?: string; confidence?: number }) => void;
  /** Update streaming content */
  updateContent: (text: string) => void;
  /** Complete streaming and finalize content */
  complete: (finalText?: string) => void;
  /** Hide ghost text */
  hide: () => void;
  /** Accept the current suggestion */
  accept: () => void;
  /** Accept first word only */
  acceptWord: () => void;
  /** Accept first line only */
  acceptLine: () => void;
  /** Reject the suggestion */
  reject: () => void;
}

const initialState: GhostTextState = {
  text: "",
  visible: false,
  isStreaming: false,
};

/**
 * Hook for managing ghost text state and interactions.
 */
export function useGhostTextStream(
  options: UseGhostTextStreamOptions = {}
): UseGhostTextStreamReturn {
  const { onAccept, onReject, showDelay = 100, hideTimeout = 3000 } = options;

  const [state, setState] = useState<GhostTextState>(initialState);
  const showTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const pendingTextRef = useRef<string>("");
  const blockIdRef = useRef<string | undefined>(undefined);
  const confidenceRef = useRef<number | undefined>(undefined);

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      if (showTimerRef.current) {
        clearTimeout(showTimerRef.current);
      }
      if (hideTimerRef.current) {
        clearTimeout(hideTimerRef.current);
      }
    };
  }, []);

  const show = useCallback(
    (text: string, opts?: { blockId?: string; confidence?: number }) => {
      // Clear any pending hide
      if (hideTimerRef.current) {
        clearTimeout(hideTimerRef.current);
      }

      pendingTextRef.current = text;
      blockIdRef.current = opts?.blockId;
      confidenceRef.current = opts?.confidence;

      // Debounce show to avoid flickering
      if (showTimerRef.current) {
        clearTimeout(showTimerRef.current);
      }

      showTimerRef.current = setTimeout(() => {
        setState({
          text: pendingTextRef.current,
          visible: true,
          isStreaming: true,
          blockId: blockIdRef.current,
          confidence: confidenceRef.current,
        });
      }, showDelay);
    },
    [showDelay]
  );

  const updateContent = useCallback((text: string) => {
    pendingTextRef.current = text;
    setState((prev) => ({
      ...prev,
      text,
    }));
  }, []);

  const complete = useCallback(
    (finalText?: string) => {
      if (showTimerRef.current) {
        clearTimeout(showTimerRef.current);
      }

      const text = finalText ?? pendingTextRef.current;

      setState((prev) => ({
        ...prev,
        text,
        isStreaming: false,
      }));

      // Auto-hide after timeout if not accepted
      hideTimerRef.current = setTimeout(() => {
        setState(initialState);
      }, hideTimeout);
    },
    [hideTimeout]
  );

  const hide = useCallback(() => {
    if (showTimerRef.current) {
      clearTimeout(showTimerRef.current);
    }
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
    }
    setState(initialState);
  }, []);

  const accept = useCallback(() => {
    const { text, blockId } = state;
    hide();
    onAccept?.(text, blockId);
  }, [state, hide, onAccept]);

  const acceptWord = useCallback(() => {
    const { text, blockId } = state;
    const firstWord = text.match(/^\S+/)?.[0] ?? "";
    if (firstWord) {
      const remaining = text.slice(firstWord.length).trimStart();
      if (remaining) {
        setState((prev) => ({ ...prev, text: remaining }));
      } else {
        hide();
      }
      onAccept?.(firstWord, blockId);
    }
  }, [state, hide, onAccept]);

  const acceptLine = useCallback(() => {
    const { text, blockId } = state;
    const newlineIndex = text.indexOf("\n");
    const firstLine = newlineIndex >= 0 ? text.slice(0, newlineIndex) : text;

    if (firstLine) {
      const remaining = newlineIndex >= 0 ? text.slice(newlineIndex + 1) : "";
      if (remaining) {
        setState((prev) => ({ ...prev, text: remaining }));
      } else {
        hide();
      }
      onAccept?.(firstLine, blockId);
    }
  }, [state, hide, onAccept]);

  const reject = useCallback(() => {
    hide();
    onReject?.();
  }, [hide, onReject]);

  return {
    state,
    show,
    updateContent,
    complete,
    hide,
    accept,
    acceptWord,
    acceptLine,
    reject,
  };
}
