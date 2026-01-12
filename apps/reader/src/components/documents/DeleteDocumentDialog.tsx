"use client";

import { Button } from "@/components/ui/Button";
import { Dialog, DialogFooter } from "@/components/ui/Dialog";
import { AlertTriangle } from "lucide-react";
import { useTranslations } from "next-intl";

export interface DeleteDocumentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  documentTitle: string;
  onConfirm: () => void;
}

/**
 * Confirmation dialog for deleting a document.
 * Shows a warning with the document title and destructive action styling.
 */
export function DeleteDocumentDialog({
  open,
  onOpenChange,
  documentTitle,
  onConfirm,
}: DeleteDocumentDialogProps) {
  const t = useTranslations("DocumentsPanel");

  const handleConfirm = () => {
    onConfirm();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={t("deleteConfirmTitle")} size="sm">
      <div className="flex gap-4">
        {/* Warning icon */}
        <div className="flex-shrink-0 flex items-start pt-0.5">
          <div className="w-10 h-10 rounded-full bg-destructive/10 flex items-center justify-center">
            <AlertTriangle className="h-5 w-5 text-destructive" aria-hidden="true" />
          </div>
        </div>

        {/* Message */}
        <div className="flex-1 min-w-0">
          <p className="text-sm text-muted-foreground leading-relaxed break-words overflow-wrap-anywhere">
            {t.rich("deleteConfirmDescription", {
              title: documentTitle,
              bold: (chunks) => (
                <span className="font-semibold text-foreground break-all">{chunks}</span>
              ),
            })}
          </p>
        </div>
      </div>

      <DialogFooter>
        <Button type="button" variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
          {t("cancel")}
        </Button>
        <Button type="button" variant="destructive" size="sm" onClick={handleConfirm}>
          {t("delete")}
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
