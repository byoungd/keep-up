"use client";

/**
 * ContentComposer v4 - Linear Edition
 *
 * Design Philosophy:
 * - Minimal chrome, maximum usability
 * - Progressive disclosure of complexity
 * - Keyboard-first with clear affordances
 * - Instant feedback, smooth transitions
 */

import { Button } from "@/components/ui/Button";
import { Dialog, DialogFooter } from "@/components/ui/Dialog";
import { isValidHttpUrl } from "@/hooks/useGlobalDropTarget";
import { useRouter } from "@/i18n/navigation";
import { buildReaderPath } from "@/i18n/paths";
import { cn } from "@/lib/utils";
import { registerFile } from "@keepup/db";
import { AnimatePresence, motion } from "framer-motion";
import { Loader2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { useImportManager } from "../../hooks/useImportManager";
import { ComposerInput } from "./ComposerInput";
import { ComposerItemList } from "./ComposerItemList";
import { ComposerOverlay } from "./ComposerOverlay";
import { SmartSuggestions } from "./SmartSuggestions";
import { processItemEnqueue, updateItemWithResult } from "./composerHelpers";
import { createItemFromInput, generateComposerId } from "./composerItemFactory";
import { composerReducer, initialComposerState } from "./composerReducer";
import type { AddSourceItem, ComposerAction, SourceKind } from "./types";
import { useComposerJobSync } from "./useComposerJobSync";

interface ContentComposerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  prefillUrl?: string;
}

type ImportManager = NonNullable<ReturnType<typeof useImportManager>>;
type ComposerDispatch = (action: ComposerAction) => void;

function collectItemsToProcess(
  inputValue: string,
  items: AddSourceItem[],
  dispatch: ComposerDispatch,
  setInputValue: (value: string) => void
): AddSourceItem[] {
  const trimmed = inputValue.trim();
  const draftItems = items.filter((item) => item.status === "draft");
  const itemsToProcess = [...draftItems];

  if (!trimmed) {
    return itemsToProcess;
  }

  const localId = generateComposerId();
  const newItem = createItemFromInput(trimmed, localId);
  dispatch({ type: "ADD_TEXT", content: trimmed, localId });
  setInputValue("");

  if (newItem.status === "draft") {
    itemsToProcess.push(newItem);
  }

  return itemsToProcess;
}

async function enqueueItem(
  item: AddSourceItem,
  manager: ImportManager,
  dispatch: ComposerDispatch
): Promise<void> {
  try {
    dispatch({ type: "UPDATE_ITEM_STATUS", localId: item.localId, status: "queued" });
    const result = await processItemEnqueue(item, manager, registerFile);
    updateItemWithResult(dispatch, item.localId, result);
  } catch (err) {
    dispatch({
      type: "UPDATE_ITEM_STATUS",
      localId: item.localId,
      status: "failed",
      errorMessage: err instanceof Error ? err.message : "Failed",
    });
  }
}

async function enqueueItems(
  items: AddSourceItem[],
  manager: ImportManager,
  dispatch: ComposerDispatch
): Promise<void> {
  for (const item of items) {
    await enqueueItem(item, manager, dispatch);
  }
}

export function ContentComposer({ open, onOpenChange, prefillUrl }: ContentComposerProps) {
  const t = useTranslations("Import");
  const router = useRouter();
  const locale = useLocale();
  const manager = useImportManager();

  // State
  const [state, dispatch] = useReducer(composerReducer, initialComposerState);
  const [inputValue, setInputValue] = useState("");
  const [isDragOver, setIsDragOver] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [detectedKind, setDetectedKind] = useState<SourceKind>("text");

  // Refs
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Job sync
  useComposerJobSync({ items: state.items, dispatch });

  // Effects
  useEffect(() => {
    if (open && prefillUrl) {
      setInputValue(prefillUrl);
    }
  }, [open, prefillUrl]);

  useEffect(() => {
    if (open) {
      const timer = setTimeout(() => inputRef.current?.focus(), 100);
      return () => clearTimeout(timer);
    }
    // Cleanup on close
    setInputValue("");
    setIsDragOver(false);
    setIsSubmitting(false);
    dispatch({ type: "RESET" });
  }, [open]);

  // Auto-detect kind
  useEffect(() => {
    setDetectedKind(isValidHttpUrl(inputValue.trim()) ? "url" : "text");
  }, [inputValue]);

  // Handlers
  const handleAddFromInput = useCallback(() => {
    const value = inputValue.trim();
    if (!value) {
      return;
    }
    dispatch({ type: "ADD_TEXT", content: value });
    setInputValue("");
    inputRef.current?.focus();
  }, [inputValue]);

  const handleSubmit = useCallback(async () => {
    if (!manager || isSubmitting) {
      return;
    }

    const itemsToProcess = collectItemsToProcess(inputValue, state.items, dispatch, setInputValue);
    if (itemsToProcess.length === 0) {
      return;
    }

    setIsSubmitting(true);

    try {
      await enqueueItems(itemsToProcess, manager, dispatch);
    } finally {
      setIsSubmitting(false);
    }
  }, [manager, isSubmitting, inputValue, state.items]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key !== "Enter") {
        return;
      }
      if (e.metaKey || e.ctrlKey) {
        e.preventDefault();
        handleSubmit();
        return;
      }
      if (!e.shiftKey) {
        e.preventDefault();
        handleAddFromInput();
      }
    },
    [handleAddFromInput, handleSubmit]
  );

  const handleFileSelect = useCallback((files: FileList | File[]) => {
    const fileArray = Array.from(files);
    if (fileArray.length > 0) {
      dispatch({ type: "ADD_FILES", files: fileArray });
    }
  }, []);

  const handleDragEvents = useCallback((e: React.DragEvent, isOver: boolean) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(isOver);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragOver(false);
      if (e.dataTransfer.files.length > 0) {
        handleFileSelect(e.dataTransfer.files);
      }
    },
    [handleFileSelect]
  );

  // Derived state
  const hasItems = state.items.length > 0;
  const canSubmit =
    (state.items.some((i) => i.status === "draft") || inputValue.trim().length > 0) &&
    !isSubmitting;
  const showSuggestions = !inputValue && !hasItems && !isDragOver;

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={t("title")} size="md">
      <div
        className="relative min-h-[280px]"
        onDragOver={(e) => handleDragEvents(e, true)}
        onDragLeave={(e) => handleDragEvents(e, false)}
        onDrop={handleDrop}
      >
        {/* Drop Overlay */}
        <ComposerOverlay isVisible={isDragOver} />

        {/* Content */}
        <div className="relative z-10 space-y-3">
          {/* Input */}
          <ComposerInput
            ref={inputRef}
            value={inputValue}
            onChange={setInputValue}
            onKeyDown={handleKeyDown}
            onAdd={handleAddFromInput}
            onFileSelect={() => fileInputRef.current?.click()}
            isDragOver={isDragOver}
            detectedKind={detectedKind}
          />

          {/* Hidden file input */}
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".md,.markdown,.txt,.html,.htm"
            onChange={(e) => {
              if (e.target.files) {
                handleFileSelect(e.target.files);
                e.target.value = "";
              }
            }}
            className="hidden"
          />

          {/* Suggestions */}
          <AnimatePresence>
            {showSuggestions && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.15 }}
              >
                <SmartSuggestions
                  onSelectSuggestion={(s) => {
                    setInputValue(s.url ?? s.title);
                    inputRef.current?.focus();
                  }}
                />
              </motion.div>
            )}
          </AnimatePresence>

          {/* Item List */}
          <ComposerItemList
            items={state.items}
            onRemove={(id) => dispatch({ type: "REMOVE_ITEM", localId: id })}
            onOpen={(docId) => {
              onOpenChange(false);
              router.push(buildReaderPath(docId, locale));
            }}
          />
        </div>
      </div>

      {/* Footer - Linear-style minimal chrome */}
      <DialogFooter className="mt-4">
        <div className="flex items-center justify-between w-full">
          {/* Keyboard hints - subtle, non-competing */}
          <div className="hidden sm:flex items-center gap-4 text-[10px] text-muted-foreground/40">
            <AnimatePresence mode="wait">
              {isSubmitting ? (
                <motion.span
                  key="importing"
                  initial={{ opacity: 0, x: -4 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 4 }}
                  transition={{ duration: 0.15 }}
                  className="flex items-center gap-1.5 text-primary/70"
                >
                  <Loader2 className="w-3 h-3 animate-spin" aria-hidden="true" />
                  <span className="font-medium">{t("importing")}...</span>
                </motion.span>
              ) : (
                <motion.div
                  key="hints"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.15 }}
                  className="flex items-center gap-4"
                >
                  <span className="flex items-center gap-1.5">
                    <kbd
                      className={cn(
                        "px-1 py-0.5 rounded text-[9px]",
                        "bg-surface-1 border border-border/30",
                        "font-mono font-medium text-muted-foreground/50"
                      )}
                    >
                      ⏎
                    </kbd>
                    <span>add</span>
                  </span>
                  <span className="flex items-center gap-1.5">
                    <kbd
                      className={cn(
                        "px-1 py-0.5 rounded text-[9px]",
                        "bg-surface-1 border border-border/30",
                        "font-mono font-medium text-muted-foreground/50"
                      )}
                    >
                      ⌘⏎
                    </kbd>
                    <span>import</span>
                  </span>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Actions - clean button group */}
          <div className="flex items-center gap-2 ml-auto">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onOpenChange(false)}
              className="text-muted-foreground hover:text-foreground"
            >
              {t("cancel")}
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={handleSubmit}
              disabled={!canSubmit}
              className={cn("min-w-[80px] transition-all duration-150", isSubmitting && "pl-2.5")}
            >
              {isSubmitting && (
                <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" aria-hidden="true" />
              )}
              {t("import")}
            </Button>
          </div>
        </div>
      </DialogFooter>
    </Dialog>
  );
}
