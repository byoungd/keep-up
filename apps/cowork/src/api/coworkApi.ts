import type { CoworkRiskTag, CoworkSession, CoworkTask } from "@ku0/agent-runtime";
import { apiUrl } from "../lib/config";

export type ApiResult<T> = {
  ok: boolean;
  session?: CoworkSession;
  sessions?: CoworkSession[];
  task?: CoworkTask;
  tasks?: CoworkTask[];
  approvals?: CoworkApproval[];
  approval?: CoworkApproval;
  settings?: CoworkSettings;
  result?: ToolCheckResult;
} & T;

export type CoworkApprovalStatus = "pending" | "approved" | "rejected";

export type CoworkApproval = {
  approvalId: string;
  sessionId: string;
  action: string;
  riskTags: CoworkRiskTag[];
  reason?: string;
  status: CoworkApprovalStatus;
  createdAt: number;
  resolvedAt?: number;
};

export type CoworkSettings = {
  openAiKey?: string;
  anthropicKey?: string;
  defaultModel?: string;
  theme?: "light" | "dark";
};

export type CreateSessionPayload = {
  userId?: string;
  deviceId?: string;
  grants?: Array<{
    id?: string;
    rootPath: string;
    allowWrite?: boolean;
    allowDelete?: boolean;
    allowCreate?: boolean;
    outputRoots?: string[];
  }>;
  connectors?: Array<{
    id?: string;
    provider: string;
    scopes?: string[];
    allowActions?: boolean;
  }>;
};

export type CreateTaskPayload = {
  title?: string;
  prompt: string;
};

export type ToolCheckRequest =
  | {
      kind: "file";
      path: string;
      intent: "read" | "write" | "create" | "delete" | "rename" | "move";
      reason?: string;
      fileSizeBytes?: number;
    }
  | {
      kind: "network";
      host: string;
      reason?: string;
    }
  | {
      kind: "connector";
      connectorScopeAllowed: boolean;
      reason?: string;
    };

export type ToolCheckResult =
  | {
      status: "allowed";
      decision: { decision: "allow" | "allow_with_confirm" | "deny"; riskTags: CoworkRiskTag[] };
    }
  | {
      status: "approval_required";
      decision: { decision: "allow_with_confirm"; riskTags: CoworkRiskTag[] };
      approval: CoworkApproval;
    }
  | {
      status: "denied";
      decision: { decision: "deny"; riskTags: CoworkRiskTag[] };
    };

async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(apiUrl(path), init);
  const data = (await response.json()) as T & { error?: { message?: string } };
  if (!response.ok) {
    throw new Error(data.error?.message ?? "Request failed");
  }
  return data;
}

export async function listSessions(): Promise<CoworkSession[]> {
  const data = await fetchJson<ApiResult<unknown>>("/api/sessions");
  return data.sessions ?? [];
}

export async function createSession(payload: CreateSessionPayload): Promise<CoworkSession> {
  const data = await fetchJson<ApiResult<unknown>>("/api/sessions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!data.session) {
    throw new Error("Session not returned");
  }
  return data.session;
}

export async function listTasks(sessionId: string): Promise<CoworkTask[]> {
  const data = await fetchJson<ApiResult<unknown>>(`/api/sessions/${sessionId}/tasks`);
  return data.tasks ?? [];
}

export async function createTask(
  sessionId: string,
  payload: CreateTaskPayload
): Promise<CoworkTask> {
  const data = await fetchJson<ApiResult<unknown>>(`/api/sessions/${sessionId}/tasks`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!data.task) {
    throw new Error("Task not returned");
  }
  return data.task;
}

export async function listApprovals(sessionId: string): Promise<CoworkApproval[]> {
  const data = await fetchJson<ApiResult<unknown>>(`/api/sessions/${sessionId}/approvals`);
  return data.approvals ?? [];
}

export async function resolveApproval(approvalId: string, status: "approved" | "rejected") {
  const data = await fetchJson<ApiResult<unknown>>(`/api/approvals/${approvalId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status }),
  });
  if (!data.approval) {
    throw new Error("Approval not returned");
  }
  return data.approval;
}

export async function getSettings(): Promise<CoworkSettings> {
  const data = await fetchJson<ApiResult<unknown>>("/api/settings");
  return data.settings ?? {};
}

export async function updateSettings(patch: CoworkSettings): Promise<CoworkSettings> {
  const data = await fetchJson<ApiResult<unknown>>("/api/settings", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  return data.settings ?? {};
}

export async function checkTool(
  sessionId: string,
  payload: ToolCheckRequest
): Promise<ToolCheckResult> {
  const data = await fetchJson<ApiResult<unknown>>(`/api/sessions/${sessionId}/tools/check`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!data.result) {
    throw new Error("Tool check result not returned");
  }
  return data.result as ToolCheckResult;
}
