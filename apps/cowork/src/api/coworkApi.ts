import type { CoworkProject, CoworkRiskTag, CoworkSession, CoworkTask } from "@ku0/agent-runtime";
import { apiUrl } from "../lib/config";

export type ApiResult<T> = {
  ok: boolean;
  session?: CoworkSession;
  sessions?: CoworkSession[];
  task?: CoworkTask;
  tasks?: CoworkTask[];
  approvals?: CoworkApproval[];
  approval?: CoworkApproval;
  projects?: CoworkProject[];
  project?: CoworkProject;
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
  geminiKey?: string;
  defaultModel?: string;
  theme?: "light" | "dark";
};

export type CreateSessionPayload = {
  userId?: string;
  deviceId?: string;
  title?: string;
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
  modelId?: string;
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

export type ChatMessage = {
  id: string;
  sessionId: string;
  role: "user" | "assistant";
  content: string;
  createdAt: number;
  modelId?: string;
  providerId?: string;
  fallbackNotice?: string;
};

export type SendChatPayload = {
  content: string;
};

export type ChatStreamMeta = {
  modelId?: string;
  providerId?: string;
  fallbackNotice?: string;
};

/**
 * Send a chat message (lightweight, no task creation)
 * Returns streamed response chunks via callback
 */
export async function sendChatMessage(
  sessionId: string,
  payload: SendChatPayload,
  onChunk?: (chunk: string) => void,
  onMeta?: (meta: ChatStreamMeta) => void
): Promise<ChatMessage> {
  const response = await fetch(apiUrl(`/api/sessions/${sessionId}/chat`), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    // Try to parse error as JSON, but handle case where it's not JSON
    try {
      const error = (await response.json()) as { error?: { message?: string } };
      throw new Error(error.error?.message ?? "Chat request failed");
    } catch {
      throw new Error("Chat request failed");
    }
  }

  const modelId = response.headers.get("x-cowork-model") ?? undefined;
  const providerId = response.headers.get("x-cowork-provider") ?? undefined;
  const fallbackNotice = response.headers.get("x-cowork-fallback") ?? undefined;
  if (onMeta) {
    onMeta({ modelId, providerId, fallbackNotice });
  }

  // Server always returns streaming text response
  if (!response.body) {
    throw new Error("No response body");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let fullContent = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    const chunk = decoder.decode(value, { stream: true });
    fullContent += chunk;
    if (onChunk) {
      onChunk(chunk);
    }
  }

  return {
    id: crypto.randomUUID(),
    sessionId,
    role: "assistant",
    content: fullContent,
    createdAt: Date.now(),
    modelId,
    providerId,
    fallbackNotice,
  };
}

/**
 * Get chat history for a session
 */
export async function getChatHistory(sessionId: string): Promise<ChatMessage[]> {
  const data = await fetchJson<ApiResult<{ messages?: ChatMessage[] }>>(
    `/api/sessions/${sessionId}/chat`
  );
  return data.messages ?? [];
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

export async function listProjects(): Promise<CoworkProject[]> {
  const data = await fetchJson<ApiResult<unknown>>("/api/projects");
  return data.projects ?? [];
}

export async function createProject(payload: {
  name: string;
  description?: string;
  pathHint?: string;
  metadata?: Record<string, unknown>;
}): Promise<CoworkProject> {
  const data = await fetchJson<ApiResult<unknown>>("/api/projects", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!data.project) {
    throw new Error("Project not returned");
  }
  return data.project;
}

export async function getProject(projectId: string): Promise<CoworkProject> {
  const data = await fetchJson<ApiResult<unknown>>(`/api/projects/${projectId}`);
  if (!data.project) {
    throw new Error("Project not found");
  }
  return data.project;
}

export async function updateSession(
  sessionId: string,
  payload: { title?: string; projectId?: string | null; endedAt?: number }
): Promise<CoworkSession> {
  const data = await fetchJson<ApiResult<unknown>>(`/api/sessions/${sessionId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!data.session) {
    throw new Error("Session not returned");
  }
  return data.session;
}

export async function deleteSession(sessionId: string): Promise<void> {
  await fetchJson<{ ok: boolean }>(`/api/sessions/${sessionId}`, {
    method: "DELETE",
  });
}
