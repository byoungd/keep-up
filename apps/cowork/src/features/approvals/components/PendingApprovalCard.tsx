import { RiskLevel } from "../../tasks/types";

interface PendingApprovalCardProps {
  toolName: string;
  args: Record<string, unknown>;
  riskLevel: RiskLevel;
  onApprove: () => void;
  onReject: () => void;
}

export function PendingApprovalCard({
  toolName,
  args,
  riskLevel,
  onApprove,
  onReject,
}: PendingApprovalCardProps) {
  const riskColor = {
    [RiskLevel.LOW]: "border-info/50 bg-info/5",
    [RiskLevel.MEDIUM]: "border-warning/50 bg-warning/5",
    [RiskLevel.HIGH]: "border-destructive/50 bg-destructive/5",
  }[riskLevel];

  const riskBadge = {
    [RiskLevel.LOW]: "text-info bg-info/10 border-info/20",
    [RiskLevel.MEDIUM]: "text-warning bg-warning/10 border-warning/20",
    [RiskLevel.HIGH]: "text-destructive bg-destructive/10 border-destructive/20",
  }[riskLevel];

  return (
    <div
      className={`border-l-4 p-5 rounded-r-xl shadow-lg ring-1 ring-black/5 mx-2 my-4 animate-pulse-subtle ${riskColor}`}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex flex-col">
          <span className="text-micro font-bold uppercase tracking-widest text-muted-foreground mb-0.5">
            Permission Request
          </span>
          <h3 className="font-bold text-foreground flex items-center gap-2 text-lg">
            Use Tool
            <code className="text-sm font-mono bg-surface/80 px-1.5 py-0.5 rounded border border-border/50 shadow-sm">
              {toolName}
            </code>
          </h3>
        </div>
        <span
          className={`text-micro px-2.5 py-1 rounded-full uppercase font-bold border tracking-wide flex items-center gap-1 ${riskBadge}`}
        >
          <span className="w-1.5 h-1.5 rounded-full bg-current" />
          {riskLevel} Risk
        </span>
      </div>

      <div className="bg-surface/60 backdrop-blur-sm border border-black/5 p-3.5 rounded-lg text-xs font-mono text-muted-foreground mb-5 shadow-inner">
        <pre>{JSON.stringify(args, null, 2)}</pre>
      </div>

      <div className="flex gap-3">
        <button
          type="button"
          onClick={onApprove}
          className="flex-1 bg-foreground hover:bg-black text-background px-4 py-2.5 rounded-lg text-sm font-semibold shadow-md active:transform active:scale-[0.98] transition-all"
        >
          Allow Execution
        </button>
        <button
          type="button"
          onClick={onReject}
          className="px-4 py-2.5 rounded-lg text-sm font-semibold text-muted-foreground hover:bg-muted border border-border shadow-sm hover:border-foreground/20 transition-all"
        >
          Block
        </button>
      </div>
    </div>
  );
}
