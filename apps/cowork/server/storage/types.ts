import type { AgentState, CoworkRiskTag } from "@ku0/agent-runtime";

// ============================================================================
// Audit Log Types
// ============================================================================

export type CoworkAuditAction =
  | "tool_call"
  | "tool_result"
  | "tool_error"
  | "policy_decision"
  | "artifact_apply"
  | "artifact_revert"
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
  /** Encrypted provider keys (preferred storage) */
  providerKeys?: ProviderKeyMap;
  /** Legacy plaintext keys (migrated into providerKeys on read) */
  openAiKey?: string;
  anthropicKey?: string;
  geminiKey?: string;
  defaultModel?: string;
  theme?: "light" | "dark";
}

export type CoworkProviderId = "openai" | "anthropic" | "gemini";

export interface ProviderKeyRecord {
  providerId: CoworkProviderId;
  encryptedKey: string;
  createdAt: number;
  updatedAt: number;
  lastValidatedAt?: number;
}

export type ProviderKeyMap = Partial<Record<CoworkProviderId, ProviderKeyRecord>>;

export type CoworkChatMessageStatus = "pending" | "streaming" | "done" | "error" | "canceled";

export interface CoworkChatAttachmentRef {
  id: string;
  kind: "image" | "file";
  name: string;
  sizeBytes: number;
  mimeType: string;
  storageUri: string;
}

export interface CoworkChatMessage {
  messageId: string;
  sessionId: string;
  role: "user" | "assistant";
  content: string;
  createdAt: number;
  updatedAt?: number;
  status: CoworkChatMessageStatus;
  modelId?: string;
  providerId?: string;
  fallbackNotice?: string;
  parentId?: string;
  clientRequestId?: string;
  taskId?: string;
  attachments?: CoworkChatAttachmentRef[];
  metadata?: Record<string, unknown>;
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
  version: number;
  status: "pending" | "applied" | "reverted";
  appliedAt?: number;
  createdAt: number;
  updatedAt: number;
}
