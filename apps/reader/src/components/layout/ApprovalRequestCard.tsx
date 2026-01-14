"use client";

import { Button } from "@/components/ui/Button";
import { cn } from "@keepup/shared/utils";

export interface ApprovalRequestCardProps {
  request: {
    confirmationId: string;
    toolName: string;
    description: string;
    arguments: Record<string, unknown>;
    risk: "low" | "medium" | "high";
    reason?: string;
    riskTags?: string[];
  };
  isBusy?: boolean;
  error?: string | null;
  onApprove: () => void;
  onReject: () => void;
  translations: {
    title: string;
    approve: string;
    reject: string;
    riskLabel: string;
    reasonLabel: string;
    argumentsLabel: string;
    pendingLabel: string;
    errorLabel: string;
  };
}

const riskClasses: Record<ApprovalRequestCardProps["request"]["risk"], string> = {
  low: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
  medium: "bg-amber-500/10 text-amber-500 border-amber-500/20",
  high: "bg-red-500/10 text-red-500 border-red-500/20",
};

export function ApprovalRequestCard({
  request,
  isBusy = false,
  error,
  onApprove,
  onReject,
  translations,
}: ApprovalRequestCardProps) {
  const hasArgs = Object.keys(request.arguments ?? {}).length > 0;

  return (
    <div className="mx-6 mt-3 rounded-xl border border-border/50 bg-surface-1/70 p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground/70">
            {translations.title}
          </div>
          <div className="text-sm font-semibold text-foreground">{request.toolName}</div>
          <div className="text-xs text-muted-foreground/80">{request.description}</div>
        </div>
        <span
          className={cn(
            "rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
            riskClasses[request.risk]
          )}
        >
          {translations.riskLabel}: {request.risk}
        </span>
      </div>

      {request.reason && (
        <div className="mt-3 text-xs text-muted-foreground">
          <span className="font-medium text-foreground/80">{translations.reasonLabel}:</span>{" "}
          {request.reason}
        </div>
      )}

      {hasArgs && (
        <details className="mt-3">
          <summary className="cursor-pointer text-xs font-medium text-muted-foreground hover:text-foreground">
            {translations.argumentsLabel}
          </summary>
          <pre className="mt-2 max-h-48 overflow-auto rounded-lg bg-surface-3/40 p-2 text-[11px] text-foreground/90">
            {JSON.stringify(request.arguments, null, 2)}
          </pre>
        </details>
      )}

      {error && (
        <div className="mt-3 rounded-md border border-destructive/30 bg-destructive/10 px-2 py-1 text-xs text-destructive">
          {translations.errorLabel}: {error}
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" onClick={onApprove} disabled={isBusy}>
          {translations.approve}
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={onReject} disabled={isBusy}>
          {translations.reject}
        </Button>
        {isBusy && (
          <span className="text-[11px] text-muted-foreground">{translations.pendingLabel}</span>
        )}
      </div>
    </div>
  );
}
