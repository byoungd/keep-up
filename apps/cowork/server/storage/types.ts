import type { AgentState, CoworkRiskTag } from "@ku0/agent-runtime";

// ============================================================================
// Audit Log Types
// ============================================================================

export type CoworkAuditAction =
  | "tool_call"
  | "tool_result"
  | "tool_error"
  | "policy_decision"
  | "approval_requested"
  | "approval_resolved";

export interface CoworkAuditEntry {
  entryId: string;
  sessionId: string;
  taskId?: string;
  timestamp: number;
  action: CoworkAuditAction;
  toolName?: string;
  input?: Record<string, unknown>;
  output?: unknown;
  decision?: "allow" | "allow_with_confirm" | "deny";
  ruleId?: string;
  riskTags?: CoworkRiskTag[];
  reason?: string;
  durationMs?: number;
  outcome?: "success" | "error" | "denied";
}

export interface CoworkAuditFilter {
  sessionId?: string;
  taskId?: string;
  toolName?: string;
  action?: CoworkAuditAction;
  since?: number;
  until?: number;
  limit?: number;
  offset?: number;
}

// ============================================================================
// Approval Types
// ============================================================================

export type CoworkApprovalStatus = "pending" | "approved" | "rejected";

export interface CoworkApproval {
  approvalId: string;
  sessionId: string;
  taskId?: string;
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
  geminiKey?: string;
  defaultModel?: string;
  theme?: "light" | "dark";
}

export interface AgentStateCheckpointRecord {
  checkpointId: string;
  sessionId: string;
  state: AgentState;
  createdAt: number;
  updatedAt: number;
}

export type CoworkArtifactPayload =
  | {
      type: "diff";
      file: string;
      diff: string;
      language?: string;
    }
  | {
      type: "plan";
      steps: Array<{ id: string; label: string; status: string }>;
    }
  | {
      type: "markdown";
      content: string;
    };

export interface CoworkArtifactRecord {
  artifactId: string;
  sessionId: string;
  taskId?: string;
  title: string;
  type: CoworkArtifactPayload["type"];
  artifact: CoworkArtifactPayload;
  sourcePath?: string;
  createdAt: number;
  updatedAt: number;
}
