"use client";

import { ContentComposer } from "./ContentComposer";

interface ImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  prefillUrl?: string;
  prefillTab?: string;
}

/**
 * Legacy ImportDialog wrapper - now uses ContentComposer v2
 * @deprecated Use ContentComposer directly
 */
export function ImportDialog({
  open,
  onOpenChange,
  prefillUrl = "",
  prefillTab: _prefillTab = "url", // Legacy prop, ignored in v2
}: ImportDialogProps) {
  return <ContentComposer open={open} onOpenChange={onOpenChange} prefillUrl={prefillUrl} />;
}
