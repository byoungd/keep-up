"use client";

import { ShieldAlert } from "lucide-react";
import * as React from "react";

import {
  IssueActionButtons,
  type IssueActionHandlers,
} from "@/components/issues/IssueActionButtons";
import { useToast } from "@/components/ui/Toast";
import { getIssueDefinition } from "@/lib/issues/issues";
import { useDiagnosticsBundle } from "@/lib/lfcc/useDiagnosticsBundle";

type PolicyDegradationBannerProps = {
  reasons: Array<{ field: string; reason: string }>;
  onDismiss?: () => void;
};

export function PolicyDegradationBanner({ reasons, onDismiss }: PolicyDegradationBannerProps) {
  const issue = getIssueDefinition("POLICY_DEGRADED");
  const { toast } = useToast();
  const { copy, isAvailable } = useDiagnosticsBundle({});

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

  const actionHandlers = React.useMemo<IssueActionHandlers>(
    () => ({
      onCopyDiagnostics: isAvailable ? handleCopyDiagnostics : undefined,
      onDismiss,
    }),
    [handleCopyDiagnostics, isAvailable, onDismiss]
  );

  return (
    <div
      className="w-full bg-accent-amber/10 border-b border-accent-amber/20 text-foreground shadow-sm backdrop-blur-sm"
      role="alert"
      aria-live="assertive"
    >
      <div className="mx-auto flex max-w-5xl items-start gap-3 px-6 py-3">
        <ShieldAlert className="h-5 w-5 mt-[2px] text-accent-amber" aria-hidden="true" />
        <div className="flex-1">
          <p className="text-sm font-semibold">Compatibility mode enabled</p>
          <p className="text-xs text-muted-foreground">
            Policy negotiation tightened capabilities. Collaboration continues in degraded mode.
          </p>
          {reasons.length > 0 && (
            <ul className="mt-2 list-disc space-y-1 pl-4 text-xs text-muted-foreground">
              {reasons.map((r) => (
                <li key={`${r.field}-${r.reason}`}>{r.reason}</li>
              ))}
            </ul>
          )}
        </div>
        <IssueActionButtons issue={issue} handlers={actionHandlers} size="sm" />
      </div>
    </div>
  );
}
