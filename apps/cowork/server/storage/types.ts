import type { CoworkRiskTag } from "@ku0/agent-runtime";

export type CoworkApprovalStatus = "pending" | "approved" | "rejected";

export interface CoworkApproval {
  approvalId: string;
  sessionId: string;
  action: string;
  riskTags: CoworkRiskTag[];
  reason?: string;
  status: CoworkApprovalStatus;
  createdAt: number;
  resolvedAt?: number;
}

export interface CoworkSettings {
  openAiKey?: string;
  anthropicKey?: string;
  defaultModel?: string;
  theme?: "light" | "dark";
}
