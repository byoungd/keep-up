"use client";

import { Button } from "@/components/ui/Button";
import { Dialog, DialogFooter } from "@/components/ui/Dialog";
import { cn } from "@/lib/utils";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";

export interface RenameDocumentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  documentTitle: string;
  onRename: (newTitle: string) => void;
}

/**
 * Dialog for renaming a document.
 * Auto-selects filename (without extension) on open for quick editing.
 */
export function RenameDocumentDialog({
  open,
  onOpenChange,
  documentTitle,
  onRename,
}: RenameDocumentDialogProps) {
  const t = useTranslations("DocumentsPanel");
  const [value, setValue] = useState(documentTitle);
  const inputRef = useRef<HTMLInputElement>(null);

  // Reset value when dialog opens
  useEffect(() => {
    if (open) {
      setValue(documentTitle);
      // Focus and select on next tick after dialog animation
      requestAnimationFrame(() => {
        if (inputRef.current) {
          inputRef.current.focus();
          inputRef.current.select();
        }
      });
    }
  }, [open, documentTitle]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = value.trim();
    if (trimmed && trimmed !== documentTitle) {
      onRename(trimmed);
    } else {
      onOpenChange(false);
    }
  };

  const isUnchanged = value.trim() === documentTitle || value.trim() === "";

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={t("renameTitle")} size="sm">
      <form onSubmit={handleSubmit}>
        <div className="space-y-3">
          <label htmlFor="rename-input" className="text-sm font-medium text-foreground">
            {t("newName")}
          </label>
          <input
            ref={inputRef}
            id="rename-input"
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className={cn(
              "w-full px-3 py-2 text-sm rounded-lg",
              "bg-surface-2/50 border border-border/60",
              "focus:outline-none focus:ring-2 focus:ring-ring/50 focus:border-ring",
              "placeholder:text-muted-foreground",
              "transition-colors duration-100"
            )}
            placeholder={t("untitled")}
            autoComplete="off"
            spellCheck={false}
          />
        </div>

        <DialogFooter>
          <Button type="button" variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
            {t("cancel")}
          </Button>
          <Button type="submit" variant="primary" size="sm" disabled={isUnchanged}>
            {t("save")}
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}
