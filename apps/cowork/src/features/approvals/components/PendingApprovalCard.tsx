import { ApprovalCard } from "@ku0/shell";
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
  const resolvedRiskLevel =
    riskLevel === RiskLevel.HIGH ? "high" : riskLevel === RiskLevel.MEDIUM ? "medium" : "low";
  const toolDescription = typeof args.reason === "string" ? args.reason : undefined;

  return (
    <ApprovalCard
      toolName={toolName}
      toolDescription={toolDescription ?? `Approval required to run ${toolName}.`}
      parameters={args}
      riskLevel={resolvedRiskLevel}
      onApprove={onApprove}
      onReject={onReject}
      className="shadow-none"
    />
  );
}
