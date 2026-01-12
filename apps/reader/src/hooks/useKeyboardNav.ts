"use client";

import { useCallback, useState } from "react";

export interface UseKeyboardNavOptions<T> {
  items: T[];
  onSelect?: (item: T) => void;
  onEscape?: () => void;
  getItemId: (item: T) => string;
}

export function useKeyboardNav<T>({
  items,
  onSelect,
  onEscape,
  getItemId,
}: UseKeyboardNavOptions<T>) {
  const [focusedId, setFocusedId] = useState<string | null>(null);

  const focusByIndex = useCallback(
    (index: number) => {
      if (index < 0 || index >= items.length) {
        return;
      }
      setFocusedId(getItemId(items[index]));
    },
    [getItemId, items]
  );

  const findFocusedIndex = useCallback(() => {
    if (!focusedId) {
      return -1;
    }
    return items.findIndex((item) => getItemId(item) === focusedId);
  }, [focusedId, getItemId, items]);

  const findFocusedItem = useCallback(() => {
    if (!focusedId) {
      return null;
    }
    return items.find((item) => getItemId(item) === focusedId) ?? null;
  }, [focusedId, getItemId, items]);

  const handleArrowDown = useCallback(
    (event: React.KeyboardEvent, currentIndex: number) => {
      event.preventDefault();
      const nextIndex = Math.min(currentIndex + 1, items.length - 1);
      focusByIndex(nextIndex);
    },
    [focusByIndex, items.length]
  );

  const handleArrowUp = useCallback(
    (event: React.KeyboardEvent, currentIndex: number) => {
      event.preventDefault();
      if (currentIndex > 0) {
        focusByIndex(currentIndex - 1);
      }
    },
    [focusByIndex]
  );

  const handleEnter = useCallback(
    (event: React.KeyboardEvent) => {
      const item = findFocusedItem();
      if (!item) {
        return;
      }
      event.preventDefault();
      onSelect?.(item);
    },
    [findFocusedItem, onSelect]
  );

  const handleEscape = useCallback(
    (event: React.KeyboardEvent) => {
      event.preventDefault();
      setFocusedId(null);
      onEscape?.();
    },
    [onEscape]
  );

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (items.length === 0) {
        return;
      }

      const currentIndex = findFocusedIndex();

      switch (event.key) {
        case "ArrowDown": {
          handleArrowDown(event, currentIndex);
          break;
        }
        case "ArrowUp": {
          handleArrowUp(event, currentIndex);
          break;
        }
        case "Enter": {
          handleEnter(event);
          break;
        }
        case "Escape": {
          handleEscape(event);
          break;
        }
      }
    },
    [findFocusedIndex, handleArrowDown, handleArrowUp, handleEnter, handleEscape, items.length]
  );

  return {
    focusedId,
    setFocusedId,
    handleKeyDown,
  };
}
