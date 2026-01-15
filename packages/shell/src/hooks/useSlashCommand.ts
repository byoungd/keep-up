import * as React from "react";
import type { AIPrompt } from "../lib/ai/types";

interface UseSlashCommandProps {
  input: string;
  setInput: (value: string) => void;
  inputRef: React.RefObject<HTMLTextAreaElement | null>;
  onSend: () => void;
  prompts: AIPrompt[];
  isOverLimit?: boolean;
  isAttachmentBusy?: boolean;
  isLoading?: boolean;
  isStreaming?: boolean;
}

export function useSlashCommand({
  input,
  setInput,
  inputRef,
  onSend,
  prompts,
  isOverLimit = false,
  isAttachmentBusy = false,
  isLoading = false,
  isStreaming = false,
}: UseSlashCommandProps) {
  const [showSlashMenu, setShowSlashMenu] = React.useState(false);
  const [slashFilter, setSlashFilter] = React.useState("");
  const [slashIndex, setSlashIndex] = React.useState(0);
  const [slashPosition, setSlashPosition] = React.useState({ top: 0, left: 0 });
  const [escapedSlashIndex, setEscapedSlashIndex] = React.useState<number | null>(null);

  const handleSlashSelect = (prompt: AIPrompt) => {
    const lastSlashIndex = input.lastIndexOf("/");
    const newInput =
      input.substring(0, lastSlashIndex) +
      prompt.userPromptTemplate.replace("{{context}}", "").replace("{{input}}", "").trim();

    setInput(newInput);
    setShowSlashMenu(false);
    inputRef.current?.focus();
  };

  // Helper logic extracted to reduce complexity
  const handleDoubleSlash = (
    value: string,
    cursor: number
  ): { newValue: string; newCursor: number } | null => {
    const textBeforeCursor = value.slice(0, cursor);
    if (textBeforeCursor.endsWith("//")) {
      const charBefore = textBeforeCursor[textBeforeCursor.length - 3];
      if (!charBefore || /\s/.test(charBefore)) {
        return {
          newValue: value.slice(0, cursor - 1) + value.slice(cursor),
          newCursor: Math.max(0, cursor - 1),
        };
      }
    }
    return null;
  };

  const detectSlashCommandData = (
    value: string,
    cursor: number,
    escapedIndex: number | null
  ): { filter: string; index: number } | null => {
    const textBeforeCursor = value.slice(0, cursor);
    const lastSlash = textBeforeCursor.lastIndexOf("/");

    if (lastSlash === -1) {
      return null;
    }

    // Ensure it's the start of a word/line
    const charBefore = textBeforeCursor[lastSlash - 1];
    if (charBefore && !/\s/.test(charBefore)) {
      return null; // Not a standalone slash
    }

    if (escapedIndex === lastSlash) {
      return null; // Escaped
    }

    const filter = textBeforeCursor.slice(lastSlash + 1);
    if (/\s/.test(filter)) {
      return null; // Has spaces, not a command
    }

    return { filter, index: lastSlash };
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    const textarea = e.target;
    const cursor = textarea.selectionStart;

    // 1. Handle double slash escape // -> /
    const doubleSlash = handleDoubleSlash(value, cursor);
    if (doubleSlash) {
      setInput(doubleSlash.newValue);
      setShowSlashMenu(false);
      setEscapedSlashIndex(doubleSlash.newCursor - 1);
      requestAnimationFrame(() => {
        if (inputRef.current) {
          inputRef.current.selectionStart = doubleSlash.newCursor;
          inputRef.current.selectionEnd = doubleSlash.newCursor;
        }
      });
      return;
    }

    // 2. Clear escaped index if invalid
    if (escapedSlashIndex !== null) {
      if (escapedSlashIndex >= value.length || value[escapedSlashIndex] !== "/") {
        setEscapedSlashIndex(null);
      }
    }

    setInput(value);

    // 3. Detect Slash Command trigger
    const cmdData = detectSlashCommandData(value, cursor, escapedSlashIndex);
    if (cmdData) {
      setShowSlashMenu(true);
      setSlashFilter(cmdData.filter);
      setSlashIndex(0);

      const rect = textarea.getBoundingClientRect();
      setSlashPosition({
        top: rect.top - 10,
        left: rect.left + 20,
      });
    } else {
      setShowSlashMenu(false);
    }
  };

  const selectCurrentCommand = () => {
    const filtered = prompts.filter(
      (p) =>
        p.label.toLowerCase().includes(slashFilter.toLowerCase()) ||
        p.description.toLowerCase().includes(slashFilter.toLowerCase())
    );
    if (filtered.length > 0) {
      const selected = filtered[slashIndex % filtered.length];
      if (selected) {
        handleSlashSelect(selected);
      }
    }
  };

  const handleMenuKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>): boolean => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSlashIndex((i) => i + 1);
      return true;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setSlashIndex((i) => Math.max(0, i - 1));
      return true;
    }
    if (e.key === "Enter" || e.key === "Tab") {
      e.preventDefault();
      selectCurrentCommand();
      return true;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      setShowSlashMenu(false);
      return true;
    }
    return false;
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (showSlashMenu) {
      if (handleMenuKeyDown(e)) {
        return;
      }
    }

    if (e.key === "Enter" && !e.shiftKey && !e.metaKey) {
      e.preventDefault();
      if (isOverLimit || isAttachmentBusy || (isLoading && !isStreaming)) {
        return;
      }
      onSend();
    }
  };

  return {
    showSlashMenu,
    slashFilter,
    slashIndex,
    slashPosition,
    setShowSlashMenu,
    handleInputChange,
    handleKeyDown,
    handleSlashSelect,
  };
}
