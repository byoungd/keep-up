"use client";

import * as React from "react";

import {
  IssueActionButtons,
  type IssueActionHandlers,
} from "@/components/issues/IssueActionButtons";
import { useToast } from "@/components/ui/Toast";
import { getIssueDefinition } from "@/lib/issues/issues";
import { useDiagnosticsBundle } from "@/lib/lfcc/useDiagnosticsBundle";

export type FailClosedPayload = {
  message: string;
  payload: Record<string, unknown>;
};

export function DevFailClosedBanner({
  info,
  onClear,
}: {
  info: FailClosedPayload;
  onClear: () => void;
}) {
  const issue = getIssueDefinition("SECURITY_REJECTED");
  const payloadText = React.useMemo(() => JSON.stringify(info.payload, null, 2), [info.payload]);
  const { copy, isAvailable } = useDiagnosticsBundle({});
  const { toast } = useToast();

  const handleCopyDiagnostics = React.useCallback(async () => {
    if (!isAvailable) {
      return;
    }
    const ok = await copy();
    if (!ok) {
      toast("Diagnostics copy failed. Check clipboard permissions.", "error");
      return;
    }
    toast("Diagnostics copied.", "success");
  }, [copy, isAvailable, toast]);

  const issueActions = React.useMemo<IssueActionHandlers>(
    () => ({
      onCopyDiagnostics: isAvailable ? handleCopyDiagnostics : undefined,
      onDismiss: onClear,
    }),
    [handleCopyDiagnostics, isAvailable, onClear]
  );

  return (
    <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-foreground shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="font-semibold">
            Couldn't verify location — not shown to avoid mis-highlighting.
          </div>
          <div className="mt-1 text-xs text-muted-foreground">{info.message}</div>
        </div>
      </div>
      <div className="mt-2 flex items-center gap-2">
        <IssueActionButtons issue={issue} handlers={issueActions} />
      </div>
      <details className="mt-2 text-xs text-muted-foreground">
        <summary className="cursor-pointer">Debug payload</summary>
        <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap">{payloadText}</pre>
      </details>
    </div>
  );
}
