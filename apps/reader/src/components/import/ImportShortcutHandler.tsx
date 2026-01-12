"use client";

import { useToast } from "@/components/ui/Toast";
import { useImportContextOptional } from "@/context/ImportContext";
import { isValidHttpUrl } from "@/hooks/useGlobalDropTarget";
import { useTranslations } from "next-intl";
import { useCallback, useEffect } from "react";

/**
 * Global keyboard shortcut handler for import functionality.
 * - ⌘/Ctrl+I: Open import modal
 * - Paste detection: When pasting a URL outside of editors, open import modal
 */
export function ImportShortcutHandler() {
  const importContext = useImportContextOptional();
  const { toast } = useToast();
  const t = useTranslations("Import");

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      // ⌘/Ctrl + I
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "i") {
        // Don't trigger if focus is in an input/textarea/contenteditable
        const target = e.target as HTMLElement;
        const isEditableElement =
          target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable;

        if (!isEditableElement) {
          e.preventDefault();
          importContext?.openImportModal();
        }
      }
    },
    [importContext]
  );

  const handlePaste = useCallback(
    (e: ClipboardEvent) => {
      // Don't intercept paste in editable elements
      const target = e.target as HTMLElement;
      const isEditableElement =
        target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable;

      if (isEditableElement) {
        return;
      }

      const text = e.clipboardData?.getData("text/plain")?.trim();
      if (text && isValidHttpUrl(text)) {
        e.preventDefault();
        toast(t("pasteDetectedImporting"), "info");
        importContext?.openImportModal(text, "url");
      }
    },
    [importContext, toast, t]
  );

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("paste", handlePaste);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("paste", handlePaste);
    };
  }, [handleKeyDown, handlePaste]);

  return null;
}
