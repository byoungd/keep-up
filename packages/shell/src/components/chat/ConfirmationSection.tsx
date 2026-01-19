import { useState } from "react";
import { ApprovalCard } from "../ai/ApprovalCard";
import type { ApprovalRiskLevel } from "./types";

export function ConfirmationSection({
  metadata,
  onAction,
}: {
  metadata: {
    approvalId: string;
    toolName: string;
    args: Record<string, unknown>;
    riskLevel?: ApprovalRiskLevel;
    reason?: string;
  };
  onAction?: (
    action: "approve" | "reject",
    metadata: { approvalId: string; toolName: string; args: Record<string, unknown> }
  ) => Promise<void>;
}) {
  const [pendingAction, setPendingAction] = useState<"approve" | "reject" | null>(null);

  const parameters = metadata.args ?? {};
  const toolDescription = metadata.reason ?? `Approval required to run ${metadata.toolName}.`;

  const handleAction = async (type: "approve" | "reject") => {
    if (!onAction) {
      return;
    }
    setPendingAction(type);
    try {
      await onAction(type, {
        approvalId: metadata.approvalId,
        toolName: metadata.toolName,
        args: parameters,
      });
    } finally {
      setPendingAction(null);
    }
  };

  return (
    <div className="my-2">
      <ApprovalCard
        toolName={metadata.toolName}
        toolDescription={toolDescription}
        parameters={parameters}
        riskLevel={metadata.riskLevel ?? "medium"}
        onApprove={() => handleAction("approve")}
        onReject={() => handleAction("reject")}
        pendingAction={pendingAction}
        isDisabled={!onAction}
      />
    </div>
  );
}
