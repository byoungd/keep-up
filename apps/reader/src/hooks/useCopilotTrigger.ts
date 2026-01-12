/**
 * useCopilotTrigger Hook
 *
 * Detects when to trigger AI copilot suggestions based on:
 * - Typing pause detection
 * - Sentence/paragraph completion patterns
 * - Explicit trigger shortcuts
 */

"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/** Trigger event types */
export type CopilotTriggerType =
  | "pause" // User paused typing
  | "sentence_end" // User finished a sentence
  | "paragraph_end" // User finished a paragraph
  | "explicit" // User explicitly triggered (Ctrl+Space, etc.)
  | "selection"; // User selected text

/** Trigger event */
export interface CopilotTriggerEvent {
  /** Trigger type */
  type: CopilotTriggerType;
  /** Text before cursor */
  prefix: string;
  /** Text after cursor (if any) */
  suffix: string;
  /** Cursor position */
  cursorPosition: number;
  /** Selected text (if any) */
  selection?: string;
  /** Timestamp */
  timestamp: number;
}

/** Hook options */
export interface UseCopilotTriggerOptions {
  /** Enable trigger detection */
  enabled?: boolean;
  /** Pause threshold in ms (default: 800) */
  pauseThreshold?: number;
  /** Minimum prefix length to trigger (default: 10) */
  minPrefixLength?: number;
  /** Debounce time in ms (default: 200) */
  debounceMs?: number;
  /** Callback when trigger fires */
  onTrigger?: (event: CopilotTriggerEvent) => void;
  /** Get current editor content */
  getContent?: () => string;
  /** Get current cursor position */
  getCursorPosition?: () => number;
  /** Get current selection */
  getSelection?: () => { start: number; end: number; text: string } | null;
}

/** Hook return type */
export interface UseCopilotTriggerReturn {
  /** Whether copilot is waiting for trigger */
  isWaiting: boolean;
  /** Last trigger event */
  lastTrigger: CopilotTriggerEvent | null;
  /** Manually trigger copilot */
  trigger: (type?: CopilotTriggerType) => void;
  /** Cancel pending trigger */
  cancel: () => void;
  /** Reset state */
  reset: () => void;
  /** Handle keydown event (attach to editor) */
  handleKeyDown: (event: KeyboardEvent) => void;
  /** Handle input event (attach to editor) */
  handleInput: () => void;
  /** Handle selection change */
  handleSelectionChange: () => void;
}

/** Sentence-ending patterns */
const SENTENCE_END_PATTERN = /[.!?]\s*$/;

/** Paragraph-ending patterns */
const PARAGRAPH_END_PATTERN = /\n\n\s*$/;

/**
 * Hook for detecting copilot trigger conditions.
 */
export function useCopilotTrigger(options: UseCopilotTriggerOptions = {}): UseCopilotTriggerReturn {
  const {
    enabled = true,
    pauseThreshold = 800,
    minPrefixLength = 10,
    debounceMs = 200,
    onTrigger,
    getContent,
    getCursorPosition,
    getSelection,
  } = options;

  const [isWaiting, setIsWaiting] = useState(false);
  const [lastTrigger, setLastTrigger] = useState<CopilotTriggerEvent | null>(null);

  const pauseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastInputTimeRef = useRef<number>(0);

  /**
   * Clear all pending timers.
   */
  const clearTimers = useCallback(() => {
    if (pauseTimerRef.current) {
      clearTimeout(pauseTimerRef.current);
      pauseTimerRef.current = null;
    }
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
  }, []);

  /**
   * Fire a trigger event.
   */
  const fireTrigger = useCallback(
    (type: CopilotTriggerType) => {
      if (!enabled) {
        return;
      }

      const content = getContent?.() ?? "";
      const cursorPosition = getCursorPosition?.() ?? content.length;
      const selection = getSelection?.();

      const prefix = content.slice(0, cursorPosition);
      const suffix = content.slice(cursorPosition);

      // Check minimum prefix length (except for selection triggers)
      if (type !== "selection" && prefix.length < minPrefixLength) {
        return;
      }

      const event: CopilotTriggerEvent = {
        type,
        prefix,
        suffix,
        cursorPosition,
        selection: selection?.text,
        timestamp: Date.now(),
      };

      setLastTrigger(event);
      setIsWaiting(false);
      onTrigger?.(event);
    },
    [enabled, getContent, getCursorPosition, getSelection, minPrefixLength, onTrigger]
  );

  /**
   * Manually trigger copilot.
   */
  const trigger = useCallback(
    (type: CopilotTriggerType = "explicit") => {
      clearTimers();
      fireTrigger(type);
    },
    [clearTimers, fireTrigger]
  );

  /**
   * Cancel pending trigger.
   */
  const cancel = useCallback(() => {
    clearTimers();
    setIsWaiting(false);
  }, [clearTimers]);

  /**
   * Reset state.
   */
  const reset = useCallback(() => {
    clearTimers();
    setIsWaiting(false);
    setLastTrigger(null);
  }, [clearTimers]);

  /**
   * Handle keydown event.
   */
  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (!enabled) {
        return;
      }

      // Explicit trigger: Ctrl+Space or Cmd+Space
      if (event.code === "Space" && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        trigger("explicit");
        return;
      }

      // Cancel on Escape
      if (event.key === "Escape") {
        cancel();
        return;
      }

      // Cancel on Tab (user is navigating)
      if (event.key === "Tab") {
        cancel();
        return;
      }
    },
    [enabled, trigger, cancel]
  );

  /**
   * Handle input event.
   */
  const handleInput = useCallback(() => {
    if (!enabled) {
      return;
    }

    const now = Date.now();
    lastInputTimeRef.current = now;

    // Clear existing pause timer
    if (pauseTimerRef.current) {
      clearTimeout(pauseTimerRef.current);
    }

    setIsWaiting(true);

    // Debounce content analysis
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    debounceTimerRef.current = setTimeout(() => {
      const content = getContent?.() ?? "";
      const cursorPosition = getCursorPosition?.() ?? content.length;
      const prefix = content.slice(0, cursorPosition);

      // Check for sentence end
      if (SENTENCE_END_PATTERN.test(prefix)) {
        fireTrigger("sentence_end");
        return;
      }

      // Check for paragraph end
      if (PARAGRAPH_END_PATTERN.test(prefix)) {
        fireTrigger("paragraph_end");
        return;
      }
    }, debounceMs);

    // Set pause detection timer
    pauseTimerRef.current = setTimeout(() => {
      // Only trigger if no new input since timer was set
      if (Date.now() - lastInputTimeRef.current >= pauseThreshold - 50) {
        fireTrigger("pause");
      }
    }, pauseThreshold);
  }, [enabled, debounceMs, pauseThreshold, getContent, getCursorPosition, fireTrigger]);

  /**
   * Handle selection change.
   */
  const handleSelectionChange = useCallback(() => {
    if (!enabled) {
      return;
    }

    const selection = getSelection?.();
    if (selection && selection.text.length > 0) {
      // Debounce selection trigger
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }

      debounceTimerRef.current = setTimeout(() => {
        // Re-check selection is still valid
        const currentSelection = getSelection?.();
        if (currentSelection && currentSelection.text.length > 0) {
          fireTrigger("selection");
        }
      }, debounceMs * 2); // Longer debounce for selection
    }
  }, [enabled, getSelection, debounceMs, fireTrigger]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      clearTimers();
    };
  }, [clearTimers]);

  return {
    isWaiting,
    lastTrigger,
    trigger,
    cancel,
    reset,
    handleKeyDown,
    handleInput,
    handleSelectionChange,
  };
}
