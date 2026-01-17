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
  artifacts?: CoworkArtifact[];
  artifact?: CoworkArtifact;
} & T;

export type CoworkApprovalStatus = "pending" | "approved" | "rejected";

export type CoworkApproval = {
  approvalId: string;
  sessionId: string;
  taskId?: string;
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

export type CoworkArtifact = {
  artifactId: string;
  sessionId: string;
  taskId?: string;
  title: string;
  type: "diff" | "plan" | "markdown";
  artifact: unknown;
  sourcePath?: string;
  version: number;
  status: "pending" | "applied" | "reverted";
  appliedAt?: number;
  createdAt: number;
  updatedAt: number;
  sessionTitle?: string;
  taskTitle?: string;
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

export async function getSession(sessionId: string): Promise<CoworkSession> {
  const data = await fetchJson<ApiResult<unknown>>(`/api/sessions/${sessionId}`);
  if (!data.session) {
    throw new Error("Session not found");
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
  status?: "pending" | "streaming" | "done" | "error" | "canceled";
  modelId?: string;
  providerId?: string;
  fallbackNotice?: string;
  parentId?: string;
  attachments?: ChatAttachmentRef[];
  metadata?: Record<string, unknown>;
};

export type ChatAttachmentRef = {
  id: string;
  kind: "image" | "file";
  name: string;
  sizeBytes: number;
  mimeType: string;
  storageUri: string;
};

export type SendChatPayload = {
  content: string;
  clientRequestId?: string;
  messageId?: string;
  parentId?: string;
  attachments?: ChatAttachmentRef[];
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
async function handleChatError(response: Response): Promise<never> {
  try {
    const error = (await response.json()) as { error?: { message?: string } };
    throw new Error(error.error?.message ?? "Chat request failed");
  } catch {
    throw new Error("Chat request failed");
  }
}

async function consumeStream(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  onChunk?: (chunk: string) => void
): Promise<string> {
  const decoder = new TextDecoder();
  let fullContent = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    const chunk = decoder.decode(value, { stream: true });
    fullContent += chunk;
    onChunk?.(chunk);
  }

  return fullContent;
}

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
    await handleChatError(response);
  }

  const modelId = response.headers.get("x-cowork-model") ?? undefined;
  const providerId = response.headers.get("x-cowork-provider") ?? undefined;
  const fallbackNotice = response.headers.get("x-cowork-fallback") ?? undefined;
  const messageId = response.headers.get("x-cowork-message-id") ?? undefined;
  const requestId = response.headers.get("x-cowork-request-id") ?? undefined;

  onMeta?.({ modelId, providerId, fallbackNotice });

  if (!response.body) {
    throw new Error("No response body");
  }

  const fullContent = await consumeStream(response.body.getReader(), onChunk);

  return {
    id: messageId ?? crypto.randomUUID(),
    sessionId,
    role: "assistant",
    content: fullContent,
    createdAt: Date.now(),
    modelId,
    providerId,
    fallbackNotice,
    status: fullContent ? "done" : "error",
    metadata: requestId ? { requestId } : undefined,
  };
}

/**
 * Edit a message
 */
export async function editChatMessage(
  sessionId: string,
  messageId: string,
  content: string
): Promise<ChatMessage> {
  const data = await fetchJson<ApiResult<{ message?: ChatMessage }>>(
    `/api/sessions/${sessionId}/messages/${messageId}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    }
  );
  if (!data.message) {
    throw new Error("Message not returned after edit");
  }
  return data.message;
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

export async function uploadChatAttachment(
  sessionId: string,
  file: File
): Promise<ChatAttachmentRef> {
  const formData = new FormData();
  formData.append("file", file);
  const response = await fetch(apiUrl(`/api/sessions/${sessionId}/attachments`), {
    method: "POST",
    body: formData,
  });
  const data = (await response.json()) as ApiResult<{
    attachment?: ChatAttachmentRef;
    error?: { message: string };
  }>;
  if (!response.ok) {
    throw new Error(data.error?.message ?? "Attachment upload failed");
  }
  if (!data.attachment) {
    throw new Error("Attachment not returned");
  }
  return data.attachment;
}

export async function listApprovals(sessionId: string): Promise<CoworkApproval[]> {
  const data = await fetchJson<ApiResult<unknown>>(`/api/sessions/${sessionId}/approvals`);
  return data.approvals ?? [];
}

export async function listSessionArtifacts(sessionId: string): Promise<CoworkArtifact[]> {
  const data = await fetchJson<ApiResult<unknown>>(`/api/sessions/${sessionId}/artifacts`);
  return data.artifacts ?? [];
}

export async function listLibraryArtifacts(): Promise<CoworkArtifact[]> {
  const data = await fetchJson<ApiResult<unknown>>("/api/library/artifacts");
  return data.artifacts ?? [];
}

export async function applyArtifact(artifactId: string): Promise<CoworkArtifact> {
  const data = await fetchJson<ApiResult<unknown>>(`/api/artifacts/${artifactId}/apply`, {
    method: "POST",
  });
  if (!data.artifact) {
    throw new Error("Artifact not returned");
  }
  return data.artifact;
}

export async function revertArtifact(artifactId: string): Promise<CoworkArtifact> {
  const data = await fetchJson<ApiResult<unknown>>(`/api/artifacts/${artifactId}/revert`, {
    method: "POST",
  });
  if (!data.artifact) {
    throw new Error("Artifact not returned");
  }
  return data.artifact;
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

// ============================================================================
// Agent Mode API
// ============================================================================

export type AgentMode = "plan" | "build";

export async function getSessionMode(sessionId: string): Promise<AgentMode> {
  const data = await fetchJson<ApiResult<{ mode: AgentMode }>>(`/api/sessions/${sessionId}/mode`);
  return data.mode ?? "build";
}

export async function setSessionMode(sessionId: string, mode: AgentMode): Promise<AgentMode> {
  const data = await fetchJson<ApiResult<{ mode: AgentMode }>>(`/api/sessions/${sessionId}/mode`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mode }),
  });
  return data.mode ?? "build";
}

export async function toggleSessionMode(sessionId: string): Promise<AgentMode> {
  const data = await fetchJson<ApiResult<{ mode: AgentMode }>>(
    `/api/sessions/${sessionId}/mode/toggle`,
    {
      method: "POST",
    }
  );
  return data.mode ?? "build";
}

// ============================================================================
// Project Context API (Track 8)
// ============================================================================

export type ProjectContextInfo = {
  content?: string;
  updatedAt?: number;
};

export type ProjectAnalysisResult = {
  techStack: Array<{ category: string; name: string }>;
  structure: { name: string; type: "file" | "directory"; children?: unknown[] };
};

export async function getProjectContext(): Promise<ProjectContextInfo> {
  return fetchJson<ApiResult<ProjectContextInfo>>("/api/context");
}

export async function analyzeProject(): Promise<ProjectAnalysisResult> {
  return fetchJson<ProjectAnalysisResult>("/api/context/analyze");
}

export async function generateContext(options?: { includePatterns?: boolean }): Promise<string> {
  const data = await fetchJson<{ content: string }>("/api/context/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(options ?? {}),
  });
  return data.content;
}

export async function saveContext(content: string): Promise<void> {
  await fetchJson("/api/context/save", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content }),
  });
}

export async function refreshContext(): Promise<string> {
  const data = await fetchJson<{ content: string }>("/api/context/refresh", {
    method: "POST",
  });
  return data.content;
}
