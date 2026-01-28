import type {
  Checkpoint,
  CheckpointStatus,
  CheckpointSummary,
  ClarificationRequest,
  ClarificationResponse,
  CoworkPolicyConfig,
  CoworkProject,
  CoworkRiskTag,
  CoworkSession,
  CoworkTask,
  CoworkWorkspace,
  CoworkWorkspaceEvent,
  CoworkWorkspaceSession,
  Lesson,
  LessonProfile,
  LessonScope,
  PreflightCheckDefinition,
  PreflightPlan,
  PreflightReport,
} from "@ku0/agent-runtime";
import type {
  ContextCompressionConfig,
  SkillActivation,
  SkillIndexEntry,
} from "@ku0/agent-runtime-core";
import type { SkillValidationError } from "@ku0/agent-runtime-tools/skills";
import type {
  CallToolResult,
  ListResourcesResult,
  ListResourceTemplatesResult,
  ReadResourceResult,
  Resource,
  ResourceTemplate,
} from "@modelcontextprotocol/sdk/types.js";
import { apiUrl } from "../lib/config";

export type ApiResult<T> = {
  ok: boolean;
  session?: CoworkSession;
  sessions?: CoworkSession[];
  workspaceSessions?: CoworkWorkspaceSession[];
  workspaceSession?: CoworkWorkspaceSession;
  task?: CoworkTask;
  tasks?: CoworkTask[];
  approvals?: CoworkApproval[];
  approval?: CoworkApproval;
  clarifications?: CoworkClarification[];
  response?: CoworkClarificationResponse;
  checkpoints?: CheckpointSummary[];
  checkpoint?: Checkpoint;
  removed?: boolean;
  checkpointId?: string;
  taskId?: string;
  restoredAt?: number;
  currentStep?: number;
  createdAt?: number;
  status?: string;
  success?: boolean;
  skippedSteps?: number;
  stepsToReplay?: number;
  error?: string;
  projects?: CoworkProject[];
  project?: CoworkProject;
  workspaces?: CoworkWorkspace[];
  workspace?: CoworkWorkspace;
  workspaceEvents?: CoworkWorkspaceEvent[];
  settings?: CoworkSettings;
  gymReport?: GymReport | null;
  providers?: CoworkProvider[];
  result?: ToolCheckResult;
  lessons?: CoworkLesson[];
  lesson?: CoworkLesson;
  results?: LessonSearchResult[];
  artifacts?: CoworkArtifact[];
  artifact?: CoworkArtifact;
  user?: CoworkUser | null;
} & T;

export type CoworkUser = {
  id: string;
  email?: string;
  fullName?: string;
  imageUrl?: string;
  permissions?: string[];
};

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

export type CoworkWorkspaceSessionCreate = {
  kind: CoworkWorkspaceSession["kind"];
  workspaceId?: string;
  ownerAgentId?: string;
  controller?: CoworkWorkspaceSession["controller"];
  controllerId?: string;
  metadata?: Record<string, unknown>;
};

export type CoworkWorkspaceSessionUpdate = {
  status?: CoworkWorkspaceSession["status"];
  controller?: CoworkWorkspaceSession["controller"];
  controllerId?: string;
  endedAt?: number;
  metadata?: Record<string, unknown>;
};

export type CoworkWorkspaceEventInput = {
  kind: CoworkWorkspaceEvent["kind"];
  payload: Record<string, unknown>;
  source?: CoworkWorkspaceEvent["source"];
  timestamp?: number;
};

export type CoworkClarification = ClarificationRequest;
export type CoworkClarificationResponse = ClarificationResponse;

export type CoworkSettings = {
  defaultModel?: string;
  theme?: "light" | "dark";
  memoryProfile?: LessonProfile;
  policy?: CoworkPolicyConfig | null;
  caseInsensitivePaths?: boolean;
  contextCompression?: ContextCompressionConfig;
};

export type CoworkSkillSummary = SkillIndexEntry & {
  disabled?: boolean;
};

export type CoworkSkillsResult = {
  skills: CoworkSkillSummary[];
  activeSkills?: SkillActivation[];
  errors?: SkillValidationError[];
};

export type CoworkPolicySource = "repo" | "settings" | "default" | "deny_all";

export type CoworkAuditAction =
  | "tool_call"
  | "tool_result"
  | "tool_error"
  | "policy_decision"
  | "artifact_apply"
  | "artifact_revert"
  | "approval_requested"
  | "approval_resolved"
  | "workflow_run"
  | "preflight_run"
  | "agent_protocol_task_created"
  | "agent_protocol_step_created"
  | "agent_protocol_artifact_created";

export type CoworkAuditEntry = {
  entryId: string;
  sessionId: string;
  taskId?: string;
  timestamp: number;
  action: CoworkAuditAction;
  toolName?: string;
  input?: Record<string, unknown>;
  output?: unknown;
  policyDecision?: "allow" | "allow_with_confirm" | "deny";
  policyRuleId?: string;
  riskTags?: CoworkRiskTag[];
  riskScore?: number;
  reason?: string;
  durationMs?: number;
  outcome?: "success" | "error" | "denied";
};

export type CoworkCheckpointFilter = {
  status?: CheckpointStatus | CheckpointStatus[];
  createdAfter?: number;
  createdBefore?: number;
  limit?: number;
  sortBy?: "createdAt" | "status";
  sortOrder?: "asc" | "desc";
  agentType?: string;
};

export type CoworkCheckpointSummary = CheckpointSummary;

export type CoworkCheckpointRestoreResult = {
  checkpointId: string;
  taskId?: string;
  restoredAt: number;
  currentStep: number;
};

export type CoworkCheckpointCreateResult = {
  checkpointId: string;
  taskId?: string;
  status: CheckpointStatus;
  currentStep: number;
  createdAt: number;
};

export type CoworkCheckpointReplayResult = {
  success: boolean;
  checkpoint: Checkpoint;
  skippedSteps: number;
  stepsToReplay: number;
  error?: string;
};

export type CoworkLesson = Omit<Lesson, "embedding">;

export type LessonSearchResult = {
  score: number;
  lesson: CoworkLesson;
};

export type LessonListOptions = {
  projectId?: string;
  scope?: LessonScope | "all";
  profile?: LessonProfile | "all";
  limit?: number;
  minConfidence?: number;
};

export type LessonSearchOptions = LessonListOptions & {
  query: string;
};

export type GymReportSummary = {
  total: number;
  passed: number;
  failed: number;
  passRate: number;
  durationMs: number;
  avgTurns: number;
  avgToolCalls: number;
  iqScore: number;
};

export type GymReport = {
  runId: string;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  summary: {
    total: GymReportSummary;
  };
};

export type CoworkProviderKeySource = "settings" | "env" | "none";

export type CoworkProviderModel = {
  id: string;
  label: string;
  shortLabel?: string;
  contextWindow: number;
  supports: {
    vision: boolean;
    tools: boolean;
    thinking: boolean;
  };
  pricing?: {
    inputTokensPer1M: number;
    outputTokensPer1M: number;
  };
};

export type CoworkProvider = {
  id: string;
  name: string;
  shortName: string;
  description?: string;
  accentColor?: string;
  icon?: string;
  models: CoworkProviderModel[];
  hasKey: boolean;
  lastValidatedAt?: number;
  source: CoworkProviderKeySource;
};

export type ProviderKeyStatus = {
  providerId: string;
  hasKey: boolean;
  lastValidatedAt?: number;
  source: CoworkProviderKeySource;
};

export type CoworkArtifact = {
  artifactId: string;
  sessionId: string;
  taskId?: string;
  title: string;
  type:
    | "diff"
    | "DiffCard"
    | "plan"
    | "PlanCard"
    | "markdown"
    | "ReportCard"
    | "ChecklistCard"
    | "TestReport"
    | "ReviewReport"
    | "ImageArtifact"
    | "preflight"
    | "LayoutGraph"
    | "VisualDiffReport";
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

export type ContextChunk = {
  id: string;
  sourcePath: string;
  content: string;
  tokenCount: number;
  updatedAt: number;
};

export type ContextSearchResult = {
  score: number;
  chunk: ContextChunk;
};

export type ContextPack = {
  id: string;
  name: string;
  chunkIds: string[];
  createdAt: number;
  updatedAt: number;
};

export type ContextPackPin = {
  sessionId: string;
  packIds: string[];
  updatedAt: number;
};

export type WorkflowTemplateInput = {
  key: string;
  label: string;
  required: boolean;
  placeholder?: string;
};

export type WorkflowTemplate = {
  templateId: string;
  name: string;
  description: string;
  mode: AgentMode;
  inputs: WorkflowTemplateInput[];
  prompt: string;
  expectedArtifacts: string[];
  version: string;
  createdAt: number;
  updatedAt: number;
  usageCount?: number;
  lastUsedAt?: number;
  lastUsedInputs?: Record<string, string>;
  lastUsedSessionId?: string;
};

export type PreflightArtifact = {
  type: "preflight";
  report: PreflightReport;
  selectionNotes: string[];
  changedFiles: string[];
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
  isolationLevel?: CoworkSession["isolationLevel"];
  sandboxMode?: CoworkSession["sandboxMode"];
  toolAllowlist?: CoworkSession["toolAllowlist"];
  toolDenylist?: CoworkSession["toolDenylist"];
};

export type CreateTaskPayload = {
  title?: string;
  prompt: string;
  modelId?: string;
  metadata?: Record<string, unknown>;
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

export type McpUiToolVisibility = "always" | "contextual" | "hidden";

export type McpUiToolMeta = {
  resourceUri: string;
  label?: string;
  icon?: string;
  visibility?: McpUiToolVisibility;
};

export type CoworkMcpTool = {
  name: string;
  description: string;
  inputSchema: unknown;
  annotations?: Record<string, unknown>;
  ui?: McpUiToolMeta;
  metadata?: Record<string, unknown>;
};

export type CoworkMcpServerStatus = {
  state: "disconnected" | "connecting" | "connected" | "error";
  transport: "stdio" | "sse" | "streamableHttp";
  serverUrl?: string;
  lastError?: string;
  authRequired?: boolean;
};

export type CoworkMcpServerSummary = {
  name: string;
  description: string;
  status: CoworkMcpServerStatus;
};

export type CoworkMcpResource = Resource;

export type CoworkMcpResourceTemplate = ResourceTemplate;

export type CoworkMcpReadResourceResult = ReadResourceResult;

export type CoworkMcpListResourcesResult = ListResourcesResult;

export type CoworkMcpListResourceTemplatesResult = ListResourceTemplatesResult;

export type CoworkMcpToolCallResult = CallToolResult;

async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(apiUrl(path), init);
  const data = (await response.json()) as T & { error?: { message?: string } };
  if (!response.ok) {
    throw new Error(data.error?.message ?? "Request failed");
  }
  return data;
}

export async function getCurrentUser(): Promise<CoworkUser | null> {
  try {
    const data = await fetchJson<{ user?: CoworkUser | null }>("/api/me");
    return data.user ?? null;
  } catch (_err) {
    return null;
  }
}

export async function listLessons(options: LessonListOptions = {}): Promise<CoworkLesson[]> {
  const params = new URLSearchParams();
  if (options.projectId) {
    params.set("projectId", options.projectId);
  }
  if (options.scope && options.scope !== "all") {
    params.set("scope", options.scope);
  }
  if (options.profile && options.profile !== "all") {
    params.set("profile", options.profile);
  }
  if (options.limit !== undefined) {
    params.set("limit", String(options.limit));
  }
  if (options.minConfidence !== undefined) {
    params.set("minConfidence", String(options.minConfidence));
  }
  const query = params.toString();
  const data = await fetchJson<ApiResult<unknown>>(`/api/lessons${query ? `?${query}` : ""}`);
  return data.lessons ?? [];
}

export async function searchLessons(options: LessonSearchOptions): Promise<LessonSearchResult[]> {
  const params = new URLSearchParams();
  params.set("q", options.query);
  if (options.projectId) {
    params.set("projectId", options.projectId);
  }
  if (options.scope && options.scope !== "all") {
    params.set("scope", options.scope);
  }
  if (options.profile && options.profile !== "all") {
    params.set("profile", options.profile);
  }
  if (options.limit !== undefined) {
    params.set("limit", String(options.limit));
  }
  if (options.minConfidence !== undefined) {
    params.set("minConfidence", String(options.minConfidence));
  }
  const data = await fetchJson<ApiResult<unknown>>(`/api/lessons?${params.toString()}`);
  return data.results ?? [];
}

export async function createLesson(payload: {
  trigger: string;
  rule: string;
  confidence?: number;
  scope?: LessonScope;
  projectId?: string;
  profile?: LessonProfile;
}): Promise<CoworkLesson> {
  const data = await fetchJson<ApiResult<unknown>>("/api/lessons", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!data.lesson) {
    throw new Error("Lesson not returned");
  }
  return data.lesson;
}

export async function updateLesson(
  lessonId: string,
  payload: {
    trigger?: string;
    rule?: string;
    confidence?: number;
    scope?: LessonScope;
    projectId?: string;
    profile?: LessonProfile;
  }
): Promise<CoworkLesson> {
  const data = await fetchJson<ApiResult<unknown>>(`/api/lessons/${lessonId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!data.lesson) {
    throw new Error("Lesson not returned");
  }
  return data.lesson;
}

export async function deleteLesson(lessonId: string): Promise<void> {
  await fetchJson<ApiResult<unknown>>(`/api/lessons/${lessonId}`, {
    method: "DELETE",
  });
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

export async function listWorkspaceSessions(sessionId: string): Promise<CoworkWorkspaceSession[]> {
  const data = await fetchJson<ApiResult<unknown>>(`/api/sessions/${sessionId}/workspace-sessions`);
  return data.workspaceSessions ?? [];
}

export async function createWorkspaceSession(
  sessionId: string,
  payload: CoworkWorkspaceSessionCreate
): Promise<CoworkWorkspaceSession> {
  const data = await fetchJson<ApiResult<unknown>>(
    `/api/sessions/${sessionId}/workspace-sessions`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }
  );
  if (!data.workspaceSession) {
    throw new Error("Workspace session not returned");
  }
  return data.workspaceSession;
}

export async function getWorkspaceSession(
  workspaceSessionId: string
): Promise<CoworkWorkspaceSession> {
  const data = await fetchJson<ApiResult<unknown>>(`/api/workspace-sessions/${workspaceSessionId}`);
  if (!data.workspaceSession) {
    throw new Error("Workspace session not found");
  }
  return data.workspaceSession;
}

export async function updateWorkspaceSession(
  workspaceSessionId: string,
  payload: CoworkWorkspaceSessionUpdate
): Promise<CoworkWorkspaceSession> {
  const data = await fetchJson<ApiResult<unknown>>(
    `/api/workspace-sessions/${workspaceSessionId}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }
  );
  if (!data.workspaceSession) {
    throw new Error("Workspace session not returned");
  }
  return data.workspaceSession;
}

export async function deleteWorkspaceSession(workspaceSessionId: string): Promise<void> {
  await fetchJson<ApiResult<unknown>>(`/api/workspace-sessions/${workspaceSessionId}`, {
    method: "DELETE",
  });
}

export async function listWorkspaceSessionEvents(
  workspaceSessionId: string,
  options: { afterSequence?: number; limit?: number } = {}
): Promise<CoworkWorkspaceEvent[]> {
  const params = new URLSearchParams();
  if (options.afterSequence !== undefined) {
    params.set("afterSequence", String(options.afterSequence));
  }
  if (options.limit !== undefined) {
    params.set("limit", String(options.limit));
  }
  const query = params.toString();
  const data = await fetchJson<ApiResult<unknown>>(
    `/api/workspace-sessions/${workspaceSessionId}/events${query ? `?${query}` : ""}`
  );
  return data.workspaceEvents ?? [];
}

export async function appendWorkspaceSessionEvent(
  workspaceSessionId: string,
  event: CoworkWorkspaceEventInput
): Promise<CoworkWorkspaceEvent> {
  const data = await fetchJson<ApiResult<unknown>>(
    `/api/workspace-sessions/${workspaceSessionId}/events`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event }),
    }
  );
  const stored = data.workspaceEvents?.[0];
  if (!stored) {
    throw new Error("Workspace event not returned");
  }
  return stored;
}

export async function appendWorkspaceSessionEvents(
  workspaceSessionId: string,
  events: CoworkWorkspaceEventInput[]
): Promise<CoworkWorkspaceEvent[]> {
  const data = await fetchJson<ApiResult<unknown>>(
    `/api/workspace-sessions/${workspaceSessionId}/events`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ events }),
    }
  );
  return data.workspaceEvents ?? [];
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

export async function listCheckpoints(
  sessionId: string,
  filter: CoworkCheckpointFilter = {}
): Promise<CheckpointSummary[]> {
  const params = new URLSearchParams();
  if (filter.status) {
    const value = Array.isArray(filter.status) ? filter.status.join(",") : filter.status;
    params.set("status", value);
  }
  if (typeof filter.createdAfter === "number") {
    params.set("createdAfter", String(filter.createdAfter));
  }
  if (typeof filter.createdBefore === "number") {
    params.set("createdBefore", String(filter.createdBefore));
  }
  if (typeof filter.limit === "number") {
    params.set("limit", String(filter.limit));
  }
  if (filter.sortBy) {
    params.set("sortBy", filter.sortBy);
  }
  if (filter.sortOrder) {
    params.set("sortOrder", filter.sortOrder);
  }
  if (filter.agentType) {
    params.set("agentType", filter.agentType);
  }

  const qs = params.toString();
  const data = await fetchJson<ApiResult<unknown>>(
    `/api/sessions/${sessionId}/checkpoints${qs ? `?${qs}` : ""}`
  );
  return data.checkpoints ?? [];
}

export async function getCheckpoint(sessionId: string, checkpointId: string): Promise<Checkpoint> {
  const data = await fetchJson<ApiResult<unknown>>(
    `/api/sessions/${sessionId}/checkpoints/${checkpointId}`
  );
  if (!data.checkpoint) {
    throw new Error("Checkpoint not found");
  }
  return data.checkpoint;
}

export async function restoreCheckpoint(
  sessionId: string,
  checkpointId: string
): Promise<CoworkCheckpointRestoreResult> {
  const data = await fetchJson<ApiResult<unknown>>(
    `/api/sessions/${sessionId}/checkpoints/${checkpointId}/restore`,
    {
      method: "POST",
    }
  );
  return {
    checkpointId,
    taskId: typeof data.taskId === "string" ? data.taskId : undefined,
    restoredAt: typeof data.restoredAt === "number" ? data.restoredAt : Date.now(),
    currentStep: typeof data.currentStep === "number" ? data.currentStep : 0,
  };
}

export async function createCheckpoint(sessionId: string): Promise<CoworkCheckpointCreateResult> {
  const data = await fetchJson<ApiResult<unknown>>(`/api/sessions/${sessionId}/checkpoints`, {
    method: "POST",
  });
  if (typeof data.checkpointId !== "string") {
    throw new Error("Checkpoint not returned");
  }
  return {
    checkpointId: data.checkpointId,
    taskId: typeof data.taskId === "string" ? data.taskId : undefined,
    status:
      typeof data.status === "string" &&
      ["pending", "completed", "failed", "cancelled"].includes(data.status)
        ? (data.status as CheckpointStatus)
        : "pending",
    currentStep: typeof data.currentStep === "number" ? data.currentStep : 0,
    createdAt: typeof data.createdAt === "number" ? data.createdAt : Date.now(),
  };
}

export async function deleteCheckpoint(
  sessionId: string,
  checkpointId: string
): Promise<{ removed: boolean }> {
  const data = await fetchJson<ApiResult<unknown>>(
    `/api/sessions/${sessionId}/checkpoints/${checkpointId}`,
    {
      method: "DELETE",
    }
  );
  return { removed: Boolean(data.removed) };
}

export async function replayCheckpoint(
  sessionId: string,
  checkpointId: string
): Promise<CoworkCheckpointReplayResult> {
  const data = await fetchJson<ApiResult<unknown>>(
    `/api/sessions/${sessionId}/checkpoints/${checkpointId}/replay`,
    {
      method: "POST",
    }
  );
  return {
    success: typeof data.success === "boolean" ? data.success : true,
    checkpoint: data.checkpoint as Checkpoint,
    skippedSteps: typeof data.skippedSteps === "number" ? data.skippedSteps : 0,
    stepsToReplay: typeof data.stepsToReplay === "number" ? data.stepsToReplay : 0,
    error: typeof data.error === "string" ? data.error : undefined,
  };
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
  onMeta?: (meta: ChatStreamMeta) => void,
  signal?: AbortSignal
): Promise<ChatMessage> {
  const response = await fetch(apiUrl(`/api/sessions/${sessionId}/chat`), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal,
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

export async function listClarifications(sessionId: string): Promise<CoworkClarification[]> {
  const data = await fetchJson<ApiResult<unknown>>(`/api/sessions/${sessionId}/clarifications`);
  return data.clarifications ?? [];
}

export async function listSessionSkills(sessionId: string): Promise<CoworkSkillsResult> {
  const data = await fetchJson<{
    ok: boolean;
    skills?: CoworkSkillSummary[];
    activeSkills?: SkillActivation[];
    errors?: SkillValidationError[];
  }>(`/api/sessions/${sessionId}/skills`);
  return {
    skills: data.skills ?? [],
    activeSkills: data.activeSkills,
    errors: data.errors,
  };
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

export async function submitClarification(
  clarificationId: string,
  input: { answer: string; selectedOption?: number }
): Promise<CoworkClarificationResponse> {
  const data = await fetchJson<ApiResult<unknown>>(`/api/clarifications/${clarificationId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!data.response) {
    throw new Error("Clarification response not returned");
  }
  return data.response;
}

export async function getSettings(): Promise<CoworkSettings> {
  const data = await fetchJson<ApiResult<unknown>>("/api/settings");
  return data.settings ?? {};
}

export async function updateSettings(patch: Partial<CoworkSettings>): Promise<CoworkSettings> {
  const data = await fetchJson<ApiResult<unknown>>("/api/settings", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  return data.settings ?? {};
}

export async function getPolicyResolution(): Promise<{
  policy: CoworkPolicyConfig;
  source: CoworkPolicySource;
  reason?: string | null;
}> {
  return fetchJson<{
    policy: CoworkPolicyConfig;
    source: CoworkPolicySource;
    reason?: string | null;
  }>("/api/settings/policy");
}

export async function exportPolicyToRepo(): Promise<{ source: CoworkPolicySource; path: string }> {
  return fetchJson<{ source: CoworkPolicySource; path: string }>("/api/settings/policy/export", {
    method: "POST",
  });
}

export async function getGymReport(): Promise<GymReport | null> {
  const data = await fetchJson<ApiResult<unknown>>("/api/settings/gym-report");
  return data.gymReport ?? null;
}

export async function queryAuditLogs(filter: {
  sessionId?: string;
  taskId?: string;
  toolName?: string;
  action?: CoworkAuditAction;
  since?: number;
  until?: number;
  limit?: number;
  offset?: number;
}): Promise<CoworkAuditEntry[]> {
  const data = await fetchJson<{ entries?: CoworkAuditEntry[] }>(`/api/audit-logs/query`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(filter),
  });
  return data.entries ?? [];
}

export async function listProviders(): Promise<CoworkProvider[]> {
  const data = await fetchJson<ApiResult<unknown>>("/api/providers");
  return data.providers ?? [];
}

export async function getProviderKeyStatus(providerId: string): Promise<ProviderKeyStatus> {
  return fetchJson<ProviderKeyStatus>(`/api/settings/providers/${providerId}/key`);
}

export async function setProviderKey(providerId: string, key: string): Promise<ProviderKeyStatus> {
  return fetchJson<ProviderKeyStatus>(`/api/settings/providers/${providerId}/key`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ key }),
  });
}

export async function deleteProviderKey(providerId: string): Promise<{ removed: boolean }> {
  const data = await fetchJson<{ removed: boolean }>(`/api/settings/providers/${providerId}/key`, {
    method: "DELETE",
  });
  return data;
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

export async function listWorkspaces(): Promise<CoworkWorkspace[]> {
  const data = await fetchJson<ApiResult<unknown>>("/api/workspaces");
  return data.workspaces ?? [];
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
  payload: {
    title?: string;
    projectId?: string | null;
    endedAt?: number;
    isolationLevel?: CoworkSession["isolationLevel"];
    sandboxMode?: CoworkSession["sandboxMode"] | null;
    toolAllowlist?: CoworkSession["toolAllowlist"] | null;
    toolDenylist?: CoworkSession["toolDenylist"] | null;
  }
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

export type AgentMode = "plan" | "build" | "review";

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
  const data =
    await fetchJson<ApiResult<{ analysis?: ProjectAnalysisResult }>>("/api/context/analyze");
  if (data.analysis) {
    return data.analysis;
  }
  // Fallback: API might return result directly
  return {
    techStack: (data as unknown as ProjectAnalysisResult).techStack ?? [],
    structure: (data as unknown as ProjectAnalysisResult).structure ?? {
      name: "root",
      type: "directory",
    },
  };
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

// ============================================================================
// Context Packs API (Track 11)
// ============================================================================

export async function searchContext(
  query: string,
  options?: { limit?: number; minScore?: number; path?: string }
): Promise<ContextSearchResult[]> {
  const data = await fetchJson<{ results: ContextSearchResult[] }>("/api/context/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      query,
      limit: options?.limit,
      minScore: options?.minScore,
      path: options?.path,
    }),
  });
  return data.results ?? [];
}

export async function listContextPacks(): Promise<ContextPack[]> {
  const data = await fetchJson<{ packs: ContextPack[] }>("/api/context/packs");
  return data.packs ?? [];
}

export async function getContextPack(packId: string): Promise<ContextPack> {
  const data = await fetchJson<{ pack: ContextPack }>(`/api/context/packs/${packId}`);
  return data.pack;
}

export async function createContextPack(payload: {
  name: string;
  chunkIds: string[];
  path?: string;
}): Promise<ContextPack> {
  const data = await fetchJson<{ pack: ContextPack }>("/api/context/packs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return data.pack;
}

export async function updateContextPack(
  packId: string,
  payload: { name?: string; chunkIds?: string[]; path?: string }
): Promise<ContextPack> {
  const data = await fetchJson<{ pack: ContextPack }>(`/api/context/packs/${packId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return data.pack;
}

export async function deleteContextPack(packId: string): Promise<void> {
  await fetchJson(`/api/context/packs/${packId}`, {
    method: "DELETE",
  });
}

export async function getContextPins(sessionId: string): Promise<ContextPackPin | null> {
  const data = await fetchJson<{ pins: ContextPackPin | null }>(`/api/context/pins/${sessionId}`);
  return data.pins ?? null;
}

export async function setContextPins(
  sessionId: string,
  packIds: string[]
): Promise<ContextPackPin | null> {
  const data = await fetchJson<{ pins: ContextPackPin | null }>(`/api/context/pins/${sessionId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ packIds }),
  });
  return data.pins ?? null;
}

// ============================================================================
// Workflow Templates API (Track 12)
// ============================================================================

export async function listWorkflowTemplates(): Promise<WorkflowTemplate[]> {
  const data = await fetchJson<{ templates: WorkflowTemplate[] }>("/api/workflows");
  return data.templates ?? [];
}

export async function getWorkflowTemplate(templateId: string): Promise<WorkflowTemplate> {
  const data = await fetchJson<{ template: WorkflowTemplate }>(`/api/workflows/${templateId}`);
  return data.template;
}

export async function createWorkflowTemplate(payload: {
  name: string;
  description?: string;
  mode: AgentMode;
  inputs?: WorkflowTemplateInput[];
  prompt: string;
  expectedArtifacts?: string[];
  version?: string;
}): Promise<WorkflowTemplate> {
  const data = await fetchJson<{ template: WorkflowTemplate }>("/api/workflows", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return data.template;
}

export async function updateWorkflowTemplate(
  templateId: string,
  payload: {
    name?: string;
    description?: string;
    mode?: AgentMode;
    inputs?: WorkflowTemplateInput[];
    prompt?: string;
    expectedArtifacts?: string[];
    version?: string;
  }
): Promise<WorkflowTemplate> {
  const data = await fetchJson<{ template: WorkflowTemplate }>(`/api/workflows/${templateId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return data.template;
}

export async function deleteWorkflowTemplate(templateId: string): Promise<void> {
  await fetchJson(`/api/workflows/${templateId}`, {
    method: "DELETE",
  });
}

export async function runWorkflowTemplate(
  templateId: string,
  payload: { inputs: Record<string, string>; sessionId?: string }
): Promise<{ prompt: string; template: WorkflowTemplate }> {
  return fetchJson<{ prompt: string; template: WorkflowTemplate }>(
    `/api/workflows/${templateId}/run`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }
  );
}

export async function importWorkflowTemplates(
  templates: WorkflowTemplate[]
): Promise<WorkflowTemplate[]> {
  const data = await fetchJson<{ templates: WorkflowTemplate[] }>("/api/workflows/import", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ templates }),
  });
  return data.templates ?? [];
}

// ============================================================================
// MCP Apps API (SEP-1865)
// ============================================================================

export async function listMcpServers(): Promise<CoworkMcpServerSummary[]> {
  const data = await fetchJson<{ servers?: CoworkMcpServerSummary[] }>("/api/mcp/servers");
  return data.servers ?? [];
}

export async function listMcpTools(serverName: string): Promise<CoworkMcpTool[]> {
  const data = await fetchJson<{ tools?: CoworkMcpTool[] }>(
    `/api/mcp/servers/${encodeURIComponent(serverName)}/tools`
  );
  return data.tools ?? [];
}

export async function callMcpTool(
  serverName: string,
  payload: { name: string; arguments?: Record<string, unknown> }
): Promise<CoworkMcpToolCallResult> {
  const data = await fetchJson<{ result?: CoworkMcpToolCallResult }>(
    `/api/mcp/servers/${encodeURIComponent(serverName)}/tools/call`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }
  );
  return data.result ?? { content: [], isError: true };
}

export async function listMcpResources(
  serverName: string,
  cursor?: string
): Promise<CoworkMcpListResourcesResult> {
  const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : "";
  const data = await fetchJson<{ result?: CoworkMcpListResourcesResult }>(
    `/api/mcp/servers/${encodeURIComponent(serverName)}/resources${query}`
  );
  return data.result ?? { resources: [] };
}

export async function listMcpResourceTemplates(
  serverName: string,
  cursor?: string
): Promise<CoworkMcpListResourceTemplatesResult> {
  const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : "";
  const data = await fetchJson<{ result?: CoworkMcpListResourceTemplatesResult }>(
    `/api/mcp/servers/${encodeURIComponent(serverName)}/resource-templates${query}`
  );
  return data.result ?? { resourceTemplates: [] };
}

export async function readMcpResource(
  serverName: string,
  uri: string
): Promise<CoworkMcpReadResourceResult> {
  const query = new URLSearchParams({ uri }).toString();
  const data = await fetchJson<{ result?: CoworkMcpReadResourceResult }>(
    `/api/mcp/servers/${encodeURIComponent(serverName)}/resource?${query}`
  );
  if (!data.result) {
    throw new Error("MCP resource not found");
  }
  return data.result;
}

// ============================================================================
// Preflight API (Track 13)
// ============================================================================

export async function listPreflightChecks(): Promise<PreflightCheckDefinition[]> {
  const data = await fetchJson<{ checks: PreflightCheckDefinition[] }>("/api/preflight/checks");
  return data.checks ?? [];
}

export async function runPreflight(payload: {
  sessionId: string;
  taskId?: string;
  rootPath?: string;
  changedFiles?: string[];
  checkIds?: string[];
}): Promise<{ report: PreflightReport; plan: PreflightPlan; artifact: CoworkArtifact }> {
  return fetchJson<{ report: PreflightReport; plan: PreflightPlan; artifact: CoworkArtifact }>(
    "/api/preflight",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }
  );
}
