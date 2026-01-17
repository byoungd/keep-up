import { cn } from "@ku0/shared/utils";
import { Loader2, AlertCircle as LucideAlertCircle } from "lucide-react";
import { useState } from "react";

export function ConfirmationSection({
  metadata,
  onAction,
}: {
  metadata: {
    approvalId: string;
    toolName: string;
    args: Record<string, unknown>;
    riskLevel?: "low" | "medium" | "high";
    reason?: string;
  };
  onAction?: (
    action: "approve" | "reject",
    metadata: { approvalId: string; toolName: string; args: Record<string, unknown> }
  ) => Promise<void>;
}) {
  const [busy, setBusy] = useState<"approve" | "reject" | null>(null);

  const handleAction = async (type: "approve" | "reject") => {
    if (!onAction) {
      return;
    }
    setBusy(type);
    try {
      await onAction(type, metadata);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="bg-amber-500/5 rounded-lg p-4 my-2">
      <div className="flex items-center gap-2 mb-3">
        <div className="h-6 w-6 rounded-full bg-orange-500/10 text-orange-600 flex items-center justify-center shrink-0">
          <LucideAlertCircle className="h-3.5 w-3.5" />
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm font-medium text-foreground">
          <span>Confirm {metadata.toolName}</span>
          {metadata.riskLevel && (
            <span
              className={cn(
                "text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full border",
                getRiskBadgeClass(metadata.riskLevel)
              )}
            >
              {metadata.riskLevel} risk
            </span>
          )}
        </div>
      </div>

      {metadata.reason && (
        <div className="text-xs text-muted-foreground mb-3">
          Reason: <span className="text-foreground/80">{metadata.reason}</span>
        </div>
      )}

      {metadata.args && (
        <div className="bg-surface-2/50 rounded-md p-2 mb-3 font-mono text-xs text-muted-foreground overflow-x-auto">
          {JSON.stringify(metadata.args, null, 2)}
        </div>
      )}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => handleAction("approve")}
          disabled={!!busy}
          className="flex-1 bg-foreground text-background hover:bg-foreground/90 h-8 rounded-md text-xs font-medium transition-all flex items-center justify-center gap-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:ring-offset-1 active:scale-[0.98] disabled:opacity-50"
          aria-busy={busy === "approve"}
        >
          {busy === "approve" && <Loader2 className="h-3 w-3 animate-spin" />}
          Approve
        </button>
        <button
          type="button"
          onClick={() => handleAction("reject")}
          disabled={!!busy}
          className="flex-1 bg-surface-2 hover:bg-surface-3 text-foreground h-8 rounded-md text-xs font-medium transition-all flex items-center justify-center gap-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:ring-offset-1 active:scale-[0.98] disabled:opacity-50"
          aria-busy={busy === "reject"}
        >
          {busy === "reject" && <Loader2 className="h-3 w-3 animate-spin" />}
          Reject
        </button>
      </div>
    </div>
  );
}

function getRiskBadgeClass(riskLevel: "low" | "medium" | "high"): string {
  switch (riskLevel) {
    case "high":
      return "border-red-500/30 text-red-600 bg-red-500/10";
    case "medium":
      return "border-amber-500/30 text-amber-600 bg-amber-500/10";
    default:
      return "border-emerald-500/30 text-emerald-600 bg-emerald-500/10";
  }
}
